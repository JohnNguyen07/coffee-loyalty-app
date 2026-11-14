import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin, verifyPosStaff, type PosStaffContext } from '@/lib/auth-utils';
import { NextRequest, NextResponse } from 'next/server';
import {
  applyPhoneLoyaltyForConfirmedOrder,
  cancelPosOrder,
  getOrderAuditLogs,
  getPosMenuCatalog,
  recordOrderAuditLog,
  updateOrderFulfillmentStatus,
} from '@/lib/pos/repository';
import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_LOCATION_ID,
  extractPosOrderMetadata,
  normalizePosItems,
  serializePosFallbackNote,
  validateShippingFeeInput,
  type FulfillmentStatus,
} from '@/lib/pos/domain';
import { processPosOrderInventory } from '@/lib/inventory/pos-integration';

const VALID_FULFILLMENT_STATUSES: FulfillmentStatus[] = [
  'PENDING',
  'PREPARING',
  'READY',
  'COMPLETED',
];

async function deductWebOrderInventoryIdempotently(
  adminClient: ReturnType<typeof createAdminClient>,
  orderRow: Record<string, unknown>,
  staff: PosStaffContext | null
): Promise<void> {
  const orderId = String(orderRow.id || '');
  if (!orderId) return;

  try {
    const { data: existingDeduction } = await adminClient
      .from('pos_order_deductions')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'ACTIVE')
      .limit(1);

    if (existingDeduction && existingDeduction.length > 0) {
      return;
    }

    const { data: rawItems } = await adminClient
      .from('order_items')
      .select('product_name, size, quantity, unit_price, subtotal')
      .eq('order_id', orderId);

    if (!rawItems || rawItems.length === 0) return;

    const { categories } = await getPosMenuCatalog();
    const dynamicCatalog = categories.flatMap((c) => c.items);

    const cartInputs = rawItems.map((it) => {
      const rawName = String(it.product_name || 'Món nước');
      const cleanName = rawName.split(' [')[0].trim();
      const matched = dynamicCatalog.find(
        (m) => m.name.toLowerCase() === cleanName.toLowerCase()
      );
      return {
        itemId: matched?.id || cleanName.toLowerCase().replace(/\s+/g, '-'),
        productName: cleanName,
        sizeLabel: String(it.size || 'M'),
        quantity: Math.max(1, Number(it.quantity) || 1),
        unitPriceOverride: Number(it.unit_price) || 0,
      };
    });

    const normalizedItems = normalizePosItems(cartInputs, dynamicCatalog);
    if (normalizedItems.length === 0) return;

    const businessId = String(orderRow.business_id || staff?.businessId || DEFAULT_BUSINESS_ID);
    const locationId = String(orderRow.location_id || staff?.locationId || DEFAULT_LOCATION_ID);
    const actorId = staff?.dbUserId || String(orderRow.user_id || '');

    await processPosOrderInventory(orderId, businessId, locationId, normalizedItems, actorId);
  } catch (err) {
    console.warn('Web order inventory deduction fallback:', err);
  }
}

// GET /api/orders/[id] — Fetch order audit trail
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const staff = await verifyPosStaff();
  const admin = staff || (await verifyAdmin());
  if (!admin) {
    return NextResponse.json({ error: 'Không có quyền xem lịch sử đơn hàng' }, { status: 403 });
  }

  const { id } = await params;
  const auditLogs = await getOrderAuditLogs(id);
  return NextResponse.json({ auditLogs });
}

// PATCH /api/orders/[id] — Update order status, fulfillment, shipping, and payment (admin/cashier)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const staff = await verifyPosStaff();
  const admin = staff || (await verifyAdmin());
  if (!admin) {
    return NextResponse.json({ error: 'Không có quyền thực hiện thao tác' }, { status: 403 });
  }

  const body = await request.json();
  const {
    action,
    payment_method,
    shipping_fee,
    cancel_reason,
    fulfillment_status,
  } = body;

  if (
    !['confirm', 'cancel', 'mark_paid', 'update_shipping', 'update_fulfillment'].includes(action)
  ) {
    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const actorName = staff?.fullName || admin.fullName || 'Quản trị viên';
  const actorRole = staff?.staffRole || 'ADMIN';
  const actorId = staff?.dbUserId || admin.dbUserId || null;
  const businessId = staff?.businessId || DEFAULT_BUSINESS_ID;
  const locationId = staff?.locationId || DEFAULT_LOCATION_ID;

  if (action === 'update_fulfillment') {
    if (!staff) {
      return NextResponse.json({ error: 'Không có quyền cập nhật tiến độ phục vụ' }, { status: 403 });
    }
    const nextFulfillment = String(fulfillment_status || '').trim().toUpperCase() as FulfillmentStatus;
    if (!VALID_FULFILLMENT_STATUSES.includes(nextFulfillment)) {
      return NextResponse.json(
        { error: 'Trạng thái phục vụ không hợp lệ (PENDING, PREPARING, READY, COMPLETED).' },
        { status: 400 }
      );
    }

    const res = await updateOrderFulfillmentStatus({
      orderId: id,
      fulfillmentStatus: nextFulfillment,
      staff,
    });

    if (!res.success || !res.order) {
      return NextResponse.json(
        { error: res.error || 'Không thể cập nhật tiến độ phục vụ' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, order: res.order });
  }

  if (action === 'update_shipping') {
    const shipCheck = validateShippingFeeInput(shipping_fee);
    if (!shipCheck.valid) {
      return NextResponse.json({ error: shipCheck.error || 'Phí ship không hợp lệ' }, { status: 400 });
    }
    const fee = shipCheck.shippingFee;

    const { data: currentOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!currentOrder) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    const currentRow = currentOrder as Record<string, unknown>;
    const subtotal = Number(currentRow.subtotal) || 0;
    const discountAmount = Number(currentRow.discount_amount) || 0;
    const pointsUsed = Number(currentRow.points_used) || 0;
    const newTotalDue = Math.max(0, subtotal - discountAmount + fee - pointsUsed);

    const prevMeta = extractPosOrderMetadata(currentRow);
    const shipTag = `[Phí ship: ${fee.toLocaleString('vi-VN')}đ]`;
    let cleanHumanNote = prevMeta.userNote || '';
    if (cleanHumanNote.includes('[Phí ship:')) {
      cleanHumanNote = cleanHumanNote.replace(/\[Phí ship:\s*[^\]]+\]/gi, shipTag);
    } else {
      cleanHumanNote = cleanHumanNote ? `${cleanHumanNote} | ${shipTag}` : shipTag;
    }

    const updatedNote = String(currentRow.note || '').includes('[[ULAB_POS_META:')
      ? serializePosFallbackNote({
          ...prevMeta,
          shippingFee: fee,
          userNote: cleanHumanNote,
        })
      : cleanHumanNote;

    let updatedOrder: Record<string, unknown> | null = null;
    const { data: v2Updated, error: v2Err } = await adminClient
      .from('orders')
      .update({
        shipping_fee: fee,
        total_due: newTotalDue,
        note: updatedNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (!v2Err && v2Updated) {
      updatedOrder = v2Updated as Record<string, unknown>;
    } else {
      const { data: fallbackUpdated, error: fbErr } = await adminClient
        .from('orders')
        .update({
          total_due: newTotalDue,
          note: updatedNote,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (fbErr || !fallbackUpdated) {
        return NextResponse.json({ error: 'Lỗi cập nhật phí ship' }, { status: 500 });
      }
      updatedOrder = fallbackUpdated as Record<string, unknown>;
    }

    await recordOrderAuditLog({
      businessId: String(currentRow.business_id || businessId),
      locationId: String(currentRow.location_id || locationId),
      orderId: id,
      orderCode: String(currentRow.order_code || ''),
      action: 'UPDATED_SHIPPING_FEE',
      actorId,
      actorName,
      actorRole,
      reason: `Cập nhật phí ship ${fee.toLocaleString('vi-VN')}đ`,
      metadata: {
        shippingFee: fee,
        totalDue: newTotalDue,
      },
    });

    return NextResponse.json({ success: true, order: updatedOrder });
  }

  if (action === 'mark_paid') {
    const method = payment_method === 'BANK_TRANSFER' ? 'BANK_TRANSFER' : 'CASH';

    const { data: currentOrder } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (!currentOrder) {
      return NextResponse.json({ error: 'Không tìm thấy đơn hàng' }, { status: 404 });
    }

    const currentRow = currentOrder as Record<string, unknown>;
    const nowIso = new Date().toISOString();
    const prevMeta = extractPosOrderMetadata(currentRow);
    const baseHuman = prevMeta.userNote || '';
    const humanNote = baseHuman.includes('Đã thanh toán')
      ? baseHuman
      : [baseHuman, `[Đã thanh toán: ${method === 'BANK_TRANSFER' ? 'Chuyển khoản' : 'Tiền mặt'}]`]
          .filter(Boolean)
          .join(' | ');

    const updatedNote = String(currentRow.note || '').includes('[[ULAB_POS_META:')
      ? serializePosFallbackNote({
          ...prevMeta,
          paymentMethod: method,
          paymentStatus: 'PAID',
          fulfillmentStatus:
            prevMeta.fulfillmentStatus === 'PENDING' ? 'PREPARING' : prevMeta.fulfillmentStatus,
          userNote: humanNote,
        })
      : humanNote;

    const nextFulfillment =
      String(currentRow.fulfillment_status || '').toUpperCase() ||
      (prevMeta.fulfillmentStatus === 'PENDING' ? 'PREPARING' : prevMeta.fulfillmentStatus) ||
      'PREPARING';

    let finalOrder: Record<string, unknown> | null = null;
    try {
      const { data: updatedWithCols, error: colErr } = await adminClient
        .from('orders')
        .update({
          status: 'CONFIRMED',
          payment_method: method,
          payment_status: 'PAID',
          fulfillment_status: nextFulfillment,
          confirmed_at: currentRow.confirmed_at || nowIso,
          note: updatedNote,
          updated_at: nowIso,
        })
        .eq('id', id)
        .select()
        .single();

      if (!colErr && updatedWithCols) {
        finalOrder = updatedWithCols as Record<string, unknown>;
      }
    } catch {
      // Fallback without 0013 columns
    }

    if (!finalOrder) {
      try {
        const { data: m01Updated, error: m01Err } = await adminClient
          .from('orders')
          .update({
            status: 'CONFIRMED',
            payment_method: method,
            payment_status: 'PAID',
            confirmed_at: currentRow.confirmed_at || nowIso,
            note: updatedNote,
            updated_at: nowIso,
          })
          .eq('id', id)
          .select()
          .single();

        if (!m01Err && m01Updated) {
          finalOrder = m01Updated as Record<string, unknown>;
        }
      } catch {
        // Fallback without payment columns
      }
    }

    if (!finalOrder) {
      const { data: fallbackUpdated, error: fbErr } = await adminClient
        .from('orders')
        .update({
          status: 'CONFIRMED',
          confirmed_at: currentRow.confirmed_at || nowIso,
          note: updatedNote,
          updated_at: nowIso,
        })
        .eq('id', id)
        .select()
        .single();

      if (fbErr || !fallbackUpdated) {
        return NextResponse.json({ error: 'Lỗi cập nhật trạng thái thanh toán' }, { status: 500 });
      }
      finalOrder = fallbackUpdated as Record<string, unknown>;
    }

    // Record payment row idempotently
    try {
      const { data: existingPayment } = await adminClient
        .from('payments')
        .select('id')
        .eq('order_id', id)
        .eq('status', 'COMPLETED')
        .limit(1);

      if (!existingPayment || existingPayment.length === 0) {
        await adminClient.from('payments').insert({
          business_id: String(currentRow.business_id || businessId),
          location_id: String(currentRow.location_id || locationId),
          order_id: id,
          payment_method: method,
          amount: Number(currentRow.total_due) || 0,
          status: 'COMPLETED',
          reference_code: String(currentRow.order_code || ''),
        });
      }
    } catch {
      // Ignore if payments table is not yet migrated
    }

    await deductWebOrderInventoryIdempotently(adminClient, finalOrder, staff);
    const loyalty = await applyPhoneLoyaltyForConfirmedOrder(id);

    await recordOrderAuditLog({
      businessId: String(currentRow.business_id || businessId),
      locationId: String(currentRow.location_id || locationId),
      orderId: id,
      orderCode: String(currentRow.order_code || ''),
      action: 'MARKED_PAID',
      actorId,
      actorName,
      actorRole,
      reason: `Thu tiền (${method})`,
      metadata: {
        paymentMethod: method,
        totalDue: Number(currentRow.total_due) || 0,
      },
    });

    return NextResponse.json({ success: true, order: finalOrder, loyalty });
  }

  // Handle Cancel with Audit Reason & Point Refund via cancelPosOrder
  if (action === 'cancel' && staff) {
    const reason = String(cancel_reason || 'Khách báo hủy đơn').trim();
    const cancelRes = await cancelPosOrder({
      orderId: id,
      cancelReason: reason.length >= 3 ? reason : 'Khách báo hủy đơn',
      staff,
    });
    if (!cancelRes.success) {
      return NextResponse.json({ error: cancelRes.error || 'Không thể hủy đơn' }, { status: 400 });
    }
    return NextResponse.json({ success: true, order: cancelRes.order });
  }

  // Confirm order (via RPC then direct fallback) + deduct inventory + audit log
  let confirmResult: Record<string, unknown> | null = null;
  try {
    const { data: result, error } = await adminClient.rpc(
      action === 'confirm' ? 'confirm_order' : 'cancel_order',
      { p_order_id: id }
    );

    if (!error && result) {
      confirmResult = result as Record<string, unknown>;
    }
  } catch {
    // fallback if RPC unmigrated
  }

  let confirmedOrderRow: Record<string, unknown> | null = null;
  if (!confirmResult) {
    const fallbackStatus = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
    const nowIso = new Date().toISOString();
    const { data: directUpdated, error: directErr } = await adminClient
      .from('orders')
      .update({
        status: fallbackStatus,
        updated_at: nowIso,
        ...(action === 'confirm' ? { confirmed_at: nowIso } : { cancelled_at: nowIso }),
      })
      .eq('id', id)
      .select()
      .single();

    if (directErr) {
      return NextResponse.json(
        { error: `Không thể ${action === 'confirm' ? 'xác nhận' : 'hủy'} đơn` },
        { status: 500 }
      );
    }
    confirmedOrderRow = directUpdated as Record<string, unknown>;
  } else {
    const { data: fetched } = await adminClient
      .from('orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    confirmedOrderRow = (fetched as Record<string, unknown> | null) || null;
  }

  if (action === 'confirm' && confirmedOrderRow) {
    // Best-effort transition fulfillment PENDING -> PREPARING on confirmation
    try {
      await adminClient
        .from('orders')
        .update({ fulfillment_status: 'PREPARING' })
        .eq('id', id)
        .eq('fulfillment_status', 'PENDING');
    } catch {
      // Ignore if 0013 column not migrated yet
    }

    await deductWebOrderInventoryIdempotently(adminClient, confirmedOrderRow, staff);
    const loyalty = await applyPhoneLoyaltyForConfirmedOrder(id);

    await recordOrderAuditLog({
      businessId: String(confirmedOrderRow.business_id || businessId),
      locationId: String(confirmedOrderRow.location_id || locationId),
      orderId: id,
      orderCode: String(confirmedOrderRow.order_code || ''),
      action: 'CONFIRMED',
      actorId,
      actorName,
      actorRole,
      reason: 'Xác nhận đơn hàng',
      metadata: {
        totalDue: Number(confirmedOrderRow.total_due) || 0,
      },
    });

    if (confirmResult) {
      return NextResponse.json({ success: true, ...confirmResult, loyalty });
    }
    return NextResponse.json({ success: true, order: confirmedOrderRow, loyalty });
  }

  return NextResponse.json({
    success: true,
    ...(confirmResult || {}),
    ...(confirmedOrderRow ? { order: confirmedOrderRow } : {}),
  });
}
