import { NextRequest, NextResponse } from 'next/server';
import { resolveUserRbac } from '@/lib/rbac/server-guard';
import {
  deleteMenuProduct,
  getPosMenuCatalog,
  setProductAvailability,
  setProductPrices,
  upsertMenuProduct,
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

// POST /api/admin/products — Toggle availability, update prices, create, update, or delete menu products
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
    const {
      action,
      productId,
      isAvailable,
      sizes,
      name,
      categorySlug,
      isSignature,
      shelfLife,
      description,
    } = body;

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
      const result = await upsertMenuProduct({
        name: String(name || ''),
        categorySlug: String(categorySlug || 'matcha'),
        sizes: Array.isArray(sizes) ? sizes : [],
        isSignature: Boolean(isSignature),
        shelfLife: shelfLife ? String(shelfLife) : undefined,
        description: description ? String(description) : undefined,
        isAvailable: true,
      });

      if (!result.success || !result.product) {
        return NextResponse.json(
          { error: result.error || 'Không thể tạo món mới trong thực đơn.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        product: {
          ...result.product,
          is_available: result.product.isAvailable,
        },
      });
    }

    if (action === 'UPDATE_PRODUCT') {
      if (!productId) {
        return NextResponse.json({ error: 'Thiếu mã sản phẩm cần cập nhật.' }, { status: 400 });
      }
      const result = await upsertMenuProduct({
        id: String(productId),
        name: String(name || ''),
        categorySlug: String(categorySlug || 'matcha'),
        sizes: Array.isArray(sizes) ? sizes : [],
        isSignature: Boolean(isSignature),
        shelfLife: shelfLife ? String(shelfLife) : undefined,
        description: description ? String(description) : undefined,
        isAvailable: isAvailable !== false,
      });

      if (!result.success || !result.product) {
        return NextResponse.json(
          { error: result.error || 'Không thể cập nhật thông tin sản phẩm.' },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        product: {
          ...result.product,
          is_available: result.product.isAvailable,
        },
      });
    }

    if (action === 'DELETE_PRODUCT') {
      if (!productId) {
        return NextResponse.json({ error: 'Thiếu mã sản phẩm cần ẩn/xóa.' }, { status: 400 });
      }
      const result = await deleteMenuProduct(String(productId));
      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Không thể ẩn/xóa sản phẩm.' },
          { status: 400 }
        );
      }
      return NextResponse.json({
        success: true,
        productId: String(productId),
      });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: unknown) {
    console.error('Products API update error:', err);
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 });
  }
}
