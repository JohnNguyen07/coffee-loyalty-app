import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveUserRbac } from '@/lib/rbac/server-guard';
import {
  getPosMenuCatalog,
  setProductAvailability,
  setProductPrices,
} from '@/lib/pos/repository';

// GET /api/admin/products — Read live menu catalog synced with Supabase & POS
export async function GET() {
  try {
    const rbac = await resolveUserRbac();
    if (!rbac || (!rbac.isOwner && !rbac.isAdmin && !rbac.isManager)) {
      return NextResponse.json(
        { error: 'Không có quyền truy cập danh mục sản phẩm (yêu cầu Quản lý/Admin/Owner)' },
        { status: 403 }
      );
    }

    const catalog = await getPosMenuCatalog();
    const products = catalog.categories.flatMap((cat) =>
      cat.items.map((item) => ({
        ...item,
        categoryName: cat.name,
        categorySlug: cat.slug,
        is_available: item.isAvailable !== false,
      }))
    );

    const categories = catalog.categories.map((c, idx) => ({
      id: `cat-${idx + 1}`,
      name: c.name,
      slug: c.slug,
      itemCount: c.items.length,
    }));

    return NextResponse.json({
      products,
      categories,
      metrics: {
        totalProducts: products.length,
        totalCategories: categories.length,
        unavailableCount: products.filter((p) => !p.is_available).length,
      },
    });
  } catch (err: unknown) {
    console.error('Products API error:', err);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu sản phẩm' }, { status: 500 });
  }
}

// POST /api/admin/products — Toggle availability, update prices, or create new menu product
export async function POST(request: NextRequest) {
  try {
    const rbac = await resolveUserRbac();
    if (!rbac || (!rbac.isOwner && !rbac.isAdmin && !rbac.isManager)) {
      return NextResponse.json(
        { error: 'Không có quyền thay đổi thông tin sản phẩm (yêu cầu Quản lý/Admin/Owner)' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, productId, isAvailable, sizes, name, categorySlug, isSignature, shelfLife } = body;

    if (action === 'TOGGLE_AVAILABILITY' && productId) {
      const avail = Boolean(isAvailable);
      await setProductAvailability(productId, avail);
      return NextResponse.json({
        success: true,
        productId,
        is_available: avail,
      });
    }

    if (action === 'UPDATE_PRICES' && productId && Array.isArray(sizes)) {
      await setProductPrices(productId, sizes);
      return NextResponse.json({
        success: true,
        productId,
        sizes,
      });
    }

    if (action === 'CREATE_PRODUCT') {
      const cleanName = String(name || '').trim();
      const catSlug = String(categorySlug || 'matcha').trim();
      const rawSizes = Array.isArray(sizes) ? sizes : [];

      if (!cleanName || rawSizes.length === 0) {
        return NextResponse.json(
          { error: 'Vui lòng nhập tên món và ít nhất 1 mức giá theo Size.' },
          { status: 400 }
        );
      }

      const adminClient = createAdminClient();
      const { data: catRow } = await adminClient
        .from('menu_categories')
        .select('id, name, slug')
        .eq('slug', catSlug)
        .maybeSingle();

      if (!catRow) {
        return NextResponse.json(
          { error: 'Không tìm thấy danh mục thực đơn tương ứng trong cơ sở dữ liệu.' },
          { status: 404 }
        );
      }

      const { data: insertedItem, error: itemErr } = await adminClient
        .from('menu_items')
        .insert({
          category_id: catRow.id,
          name: cleanName,
          description: shelfLife ? String(shelfLife).trim() : null,
          is_signature: Boolean(isSignature),
          is_available: true,
          sort_order: 99,
        })
        .select('*')
        .single();

      if (itemErr || !insertedItem) {
        return NextResponse.json(
          { error: itemErr?.message || 'Không thể tạo món mới trong cơ sở dữ liệu.' },
          { status: 500 }
        );
      }

      const sizeRows = rawSizes.map((sz: { label: string; price: number }, idx: number) => ({
        item_id: insertedItem.id,
        size_label: String(sz.label || 'M'),
        price: Math.max(1000, Number(sz.price) || 0),
        is_available: true,
        sort_order: idx + 1,
      }));

      await adminClient.from('menu_item_sizes').insert(sizeRows);

      return NextResponse.json({
        success: true,
        product: {
          id: insertedItem.id,
          name: cleanName,
          category: catRow.name,
          categorySlug: catRow.slug,
          isSignature: Boolean(isSignature),
          shelfLife: shelfLife ? String(shelfLife).trim() : undefined,
          sizes: sizeRows.map((s) => ({ label: s.size_label, price: s.price })),
          is_available: true,
        },
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Products API update error:', err);
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 });
  }
}
