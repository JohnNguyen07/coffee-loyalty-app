import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPosStaff } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';
import { MENU_ADDONS } from '@/data/menu';
import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_LOCATION_ID,
  extractPosOrderMetadata,
  normalizeFulfillmentStatus,
  serializePosFallbackNote,
} from '@/lib/pos/domain';
import {
  getPersistedOrderFulfillmentMap,
  getPosMenuCatalog,
  matchesOrderLocation,
} from '@/lib/pos/repository';
import { cookies } from 'next/headers';

async function resolveProfile(
  user: { id: string; email?: string | null } | null,
  customerPhone?: string,
  customerName?: string
) {
  const adminClient = createAdminClient();
  let profile: { id: string; role: string; point_balance: number } | null = null;

  if (user) {
    const { data: byId } = await adminClient
      .from('users')
      .select('id, role, point_balance')
      .eq('id', user.id)
      .maybeSingle();
    profile = byId;

    if (!profile) {
      const { data: byGoogle } = await adminClient
        .from('users')
        .select('id, role, point_balance')
        .eq('google_id', user.id)
        .maybeSingle();
      profile = byGoogle;
    }

    if (!profile && user.email) {
      const { data: byEmail } = await adminClient
        .from('users')
        .select('id, role, point_balance')
        .eq('email', user.email)
        .maybeSingle();
      profile = byEmail;
    }
  }

  // Fallback to ulab_uid cookie if present
  if (!profile) {
    const cookieStore = await cookies();
    const uidCookie = cookieStore.get('ulab_uid')?.value;
    if (uidCookie) {
      const { data: byCookie } = await adminClient
        .from('users')
        .select('id, role, point_balance')
        .eq('id', uidCookie)
        .maybeSingle();
      profile = byCookie;
    }
  }

  // Fallback to matching phone number if customer entered their registered phone
  if (!profile && customerPhone) {
    const cleanPhone = customerPhone.replace(/[\s\-()]/g, '');
    if (cleanPhone) {
      const { data: byPhone } = await adminClient
        .from('users')
        .select('id, role, point_balance')
        .eq('phone', cleanPhone)
        .maybeSingle();
      profile = byPhone;

      // Auto-register member profile for valid phone numbers so phone loyalty works seamlessly
      if (!profile && /^0\d{8,10}$/.test(cleanPhone)) {
        const { data: memberTier } = await adminClient
          .from('tiers')
          .select('id')
          .eq('code', 'MEMBER')
          .maybeSingle();

        if (memberTier) {
          const autoName = customerName?.trim() || `Thành viên ${cleanPhone.slice(-4)}`;
          const { data: created } = await adminClient
            .from('users')
            .insert({
              full_name: autoName,
              phone: cleanPhone,
              email: `member.${cleanPhone}@ulab.vn`,
              role: 'USER',
              current_tier_id: memberTier.id,
              point_balance: 0,
              total_spending: 0,
              locked_points: 0,
            })
            .select('id, role, point_balance')
            .maybeSingle();
          if (created) {
            profile = created;
          }
        }
      }
    }
  }

  return { profile, adminClient };
}

// POST /api/orders — Create a new order (customer)
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const body = await request.json();
  const { items, points_used, note, customer_phone, customer_name, customer_address, location_id, order_code } = body;

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Giỏ hàng trống' }, { status: 400 });
  }

  const [{ profile, adminClient }, { categories }] = await Promise.all([
    resolveProfile(user, customer_phone, customer_name),
    getPosMenuCatalog(),
  ]);
  const allCatalogItems = categories.flatMap((c) => c.items);

  // Normalize items and calculate subtotal using SERVER-SIDE prices (including add-ons)
  const normalizedItems = items.map(
    (item: {
      item_id?: string;
      name?: string;
      product_name?: string;
      size_label?: string;
      size?: string;
      unit_price: number;
      quantity: number;
      addons?: string[];
      milk_option?: string;
    }) => {
      const sizeLabel = item.size_label || item.size || 'M';
      const rawName = (item.name || item.product_name || '').split(' [')[0].trim();
      const menuItem =
        allCatalogItems.find(
          (m) => m.id === item.item_id && m.sizes.some((s) => s.label === sizeLabel)
        ) ||
        allCatalogItems.find((m) => m.id === item.item_id) ||
        allCatalogItems.find(
          (m) =>
            m.name.toLowerCase() === rawName.toLowerCase() &&
            m.sizes.some((s) => s.label === sizeLabel)
        ) ||
        allCatalogItems.find((m) => m.name.toLowerCase() === rawName.toLowerCase());

      const sizeInfo = menuItem?.sizes.find((s) => s.label === sizeLabel);
      const isBottled = sizeLabel === 'Chai' || menuItem?.categorySlug === 'cold-brew-chai';
      const addonTotal =
        !isBottled && Array.isArray(item.addons)
          ? Array.from(new Set(item.addons)).reduce((sum, addonId) => {
              const found = MENU_ADDONS.find((a) => a.id === addonId);
              return sum + (found ? found.price : 0);
            }, 0)
          : 0;

      const basePrice = sizeInfo?.price ?? Math.max(0, (Number(item.unit_price) || 0) - addonTotal);
      const verifiedPrice = basePrice + addonTotal;
      const qty = Math.max(1, Number(item.quantity) || 1);
      const prodName = item.product_name || item.name || menuItem?.name || 'Món nước';

      return {
        item_id: item.item_id,
        product_name: prodName,
        name: prodName,
        size: sizeLabel,
        size_label: sizeLabel,
        unit_price: verifiedPrice,
        quantity: qty,
        subtotal: verifiedPrice * qty,
      };
    }
  );

  const subtotal = normalizedItems.reduce((sum: number, it: { subtotal: number }) => sum + it.subtotal, 0);
  const availablePoints = profile?.point_balance || 0;
  const pointsToUse = profile ? Math.min(Math.max(0, Math.floor(Number(points_used) || 0)), availablePoints, subtotal) : 0;
  const totalDue = subtotal - pointsToUse;

  // Resolve fallback user_id if profile is null and database requires user_id NOT NULL
  let targetUserId = profile?.id || null;
  if (!targetUserId) {
    const { data: fallbackAdmin } = await adminClient
      .from('users')
      .select('id')
      .eq('role', 'ADMIN')
      .limit(1)
      .maybeSingle();
    targetUserId = fallbackAdmin?.id || null;
  }

  const cleanRequestedCode =
    typeof order_code === 'string' && /^CF-\d{4,6}$/.test(order_code.trim())
      ? order_code.trim()
      : `CF-${Math.floor(1000 + Math.random() * 9000)}`;

  // Ensure uniqueness of orderCode
  const { data: existingOrderCode } = await adminClient
    .from('orders')
    .select('id')
    .eq('order_code', cleanRequestedCode)
    .maybeSingle();

  const orderCode = existingOrderCode
    ? `CF-${Math.floor(1000 + Math.random() * 9000)}`
    : cleanRequestedCode;

  const cleanPhone = String(customer_phone || '').replace(/[\s\-()]/g, '') || undefined;
  const cleanName = typeof customer_name === 'string' && customer_name.trim() ? customer_name.trim() : undefined;
  const rawHumanNote = typeof note === 'string' ? note.trim() : '';
  const dcMatch = rawHumanNote.match(/Đ\/c:\s*([^|]+)/);
  const resolvedAddress =
    (typeof customer_address === 'string' && customer_address.trim()) ||
    dcMatch?.[1]?.trim() ||
    undefined;
  const resolvedOrderType = rawHumanNote.includes('Giao tới nhà') ? 'DELIVERY' : 'TAKEAWAY';
  const targetLocationId =
    typeof location_id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(location_id.trim())
      ? location_id.trim()
      : DEFAULT_LOCATION_ID;

  const encodedNote = serializePosFallbackNote({
    channel: 'WEB',
    orderType: resolvedOrderType,
    paymentMethod: 'CASH',
    paymentStatus: 'UNPAID',
    fulfillmentStatus: 'PENDING',
    shippingFee: 0,
    customerAddress: resolvedAddress,
    discountAmount: 0,
    discountPercent: 0,
    amountReceived: 0,
    changeDue: 0,
    customerName: cleanName,
    customerPhone: cleanPhone,
    userNote: rawHumanNote,
  });

  let insertedOrder: Record<string, unknown> | null = null;
  const m01WebPayload = {
    order_code: orderCode,
    user_id: targetUserId,
    business_id: DEFAULT_BUSINESS_ID,
    location_id: targetLocationId,
    channel: 'WEB',
    order_type: resolvedOrderType,
    customer_name: cleanName || 'Khách Web',
    customer_phone: cleanPhone || null,
    status: 'PENDING',
    subtotal,
    points_used: pointsToUse,
    total_due: totalDue,
    payment_method: 'CASH',
    payment_status: 'UNPAID',
    note: encodedNote,
  };

  const { data: v2Inserted, error: v2Err } = await adminClient
    .from('orders')
    .insert({
      ...m01WebPayload,
      customer_address: resolvedAddress || null,
      fulfillment_status: 'PENDING',
    })
    .select()
    .single();

  if (!v2Err && v2Inserted) {
    insertedOrder = v2Inserted as Record<string, unknown>;
  } else {
    const { data: m01Inserted, error: m01Err } = await adminClient
      .from('orders')
      .insert(m01WebPayload)
      .select()
      .single();

    if (!m01Err && m01Inserted) {
      insertedOrder = m01Inserted as Record<string, unknown>;
    } else {
      const { data: baseInserted, error: baseErr } = await adminClient
        .from('orders')
        .insert({
          order_code: orderCode,
          user_id: targetUserId,
          status: 'PENDING',
          subtotal,
          points_used: pointsToUse,
          total_due: totalDue,
          note: encodedNote,
        })
        .select()
        .single();

      if (baseErr || !baseInserted) {
        console.error('Order creation error:', { v2Err, m01Err, baseErr });
        return NextResponse.json({ error: 'Không thể tạo đơn hàng' }, { status: 500 });
      }
      insertedOrder = baseInserted as Record<string, unknown>;
    }
  }

  const orderIdStr = String(insertedOrder.id);
  const { error: extItemsErr } = await adminClient.from('order_items').insert(
    normalizedItems.map((it: { product_name: string; size: string; quantity: number; unit_price: number; subtotal: number }) => ({
      order_id: orderIdStr,
      business_id: DEFAULT_BUSINESS_ID,
      location_id: targetLocationId,
      product_name: it.product_name,
      size: it.size,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.subtotal,
    }))
  );

  if (extItemsErr) {
    await adminClient.from('order_items').insert(
      normalizedItems.map((it: { product_name: string; size: string; quantity: number; unit_price: number; subtotal: number }) => ({
        order_id: orderIdStr,
        product_name: it.product_name,
        size: it.size,
        quantity: it.quantity,
        unit_price: it.unit_price,
        subtotal: it.subtotal,
      }))
    );
  }

  if (profile && pointsToUse > 0) {
    const newBalance = Math.max(0, profile.point_balance - pointsToUse);
    await adminClient
      .from('users')
      .update({ point_balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    await adminClient.from('point_transactions').insert({
      user_id: profile.id,
      type: 'ORDER_DEDUCT',
      amount: -pointsToUse,
      balance_after: newBalance,
      reference_id: String(insertedOrder.order_code || orderCode),
      description: `Dùng điểm cho đơn ${String(insertedOrder.order_code || orderCode)} (Đơn trừ tiền không tích điểm mới)`,
    });
  }

  return NextResponse.json({ success: true, order: insertedOrder });
}

// GET /api/orders — Get orders (staff/admin: scoped to active location, customer: own)
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [{ profile, adminClient }, staff] = await Promise.all([
    resolveProfile(user),
    verifyPosStaff(),
  ]);

  const isStaffOrAdmin = Boolean(staff) || profile?.role === 'ADMIN';

  if (!profile && !isStaffOrAdmin) {
    return NextResponse.json({ error: 'Chưa đăng nhập' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20), 200);
  const offset = (page - 1) * limit;

  const fetchLimit = isStaffOrAdmin && staff ? Math.min(limit * 4, 300) : limit;
  const fetchStart = isStaffOrAdmin && staff ? 0 : offset;

  const buildOrdersQuery = (selectStr: string) => {
    let q = adminClient
      .from('orders')
      .select(selectStr, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(fetchStart, fetchStart + fetchLimit - 1);

    // Staff/Admin sees all orders, regular customer sees only own orders
    if (!isStaffOrAdmin && profile) {
      q = q.eq('user_id', profile.id);
    }

    if (status && status !== 'ALL') {
      q = q.eq('status', status);
    }
    return q;
  };

  let { data: orders, error } = await buildOrdersQuery(
    '*, items:order_items(*), user:users!user_id(id, full_name, email, phone, current_tier_id)'
  );

  if (error) {
    const fallback = await buildOrdersQuery('*, items:order_items(*)');
    orders = fallback.data;
    error = fallback.error;
  }

  if (error) {
    console.error('Orders fetch error:', error);
    return NextResponse.json({ error: 'Lỗi truy vấn' }, { status: 500 });
  }

  const fulfillmentMap = getPersistedOrderFulfillmentMap();
  const rawList = (orders || []) as unknown as Record<string, unknown>[];
  const locationFiltered =
    isStaffOrAdmin && staff
      ? rawList.filter((o) => matchesOrderLocation(o.location_id, staff.locationId))
      : rawList;

  const enrichedOrders = locationFiltered.map((row) => {
    const orderId = String(row.id || '');
    const meta = extractPosOrderMetadata(row);
    const persisted = fulfillmentMap[orderId];
    const orderStatus = String(row.status || 'PENDING');
    const resolvedFulfillment =
      orderStatus === 'CANCELLED'
        ? 'CANCELLED'
        : persisted?.fulfillmentStatus ||
          (typeof row.fulfillment_status === 'string' && row.fulfillment_status) ||
          meta.fulfillmentStatus ||
          normalizeFulfillmentStatus(null, orderStatus, meta.channel);

    return {
      ...row,
      channel: row.channel || meta.channel,
      order_type: row.order_type || meta.orderType,
      payment_method: row.payment_method || meta.paymentMethod,
      payment_status: row.payment_status || meta.paymentStatus,
      fulfillment_status: resolvedFulfillment,
      shipping_fee: persisted?.shippingFee ?? (Number(row.shipping_fee) || meta.shippingFee || 0),
      customer_address: row.customer_address || meta.customerAddress || null,
      customer_name: row.customer_name || meta.customerName || null,
      customer_phone: row.customer_phone || meta.customerPhone || null,
    };
  });

  const pagedOrders =
    isStaffOrAdmin && staff
      ? enrichedOrders.slice(offset, offset + limit)
      : enrichedOrders;

  return NextResponse.json({
    orders: pagedOrders,
    total: enrichedOrders.length,
    page,
    limit,
  });
}
