import { NextRequest, NextResponse } from 'next/server';
import { menuData } from '@/data/menu';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyAdmin } from '@/lib/auth-utils';

// In-memory / dynamic inventory state for the cafe
let inventoryItems = [
  {
    id: 'inv-1',
    name: 'Bột Matcha Fuji MK4',
    sku: 'MAT-UJI-01',
    category: 'Nguyên liệu pha chế',
    unit: 'Gói 500g',
    current_stock: 14,
    min_stock: 5,
    cost_price: 450000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-2',
    name: 'Hạt Cà Phê Arabica Cầu Đất (Rang Medium)',
    sku: 'COF-ARA-02',
    category: 'Nguyên liệu pha chế',
    unit: 'Bao 1kg',
    current_stock: 22,
    min_stock: 8,
    cost_price: 280000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-3',
    name: 'Chai Thủy Tinh Nắp Nhôm (Cold Brew)',
    sku: 'BTL-330-GL',
    category: 'Bao bì & Đóng gói',
    unit: 'Thùng (100 chai)',
    current_stock: 42,
    min_stock: 15,
    cost_price: 320000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-4',
    name: 'Tem Niêm Phong & Nhãn Decal Chai Cold Brew',
    sku: 'LBL-BTL-CB',
    category: 'Bao bì & Đóng gói',
    unit: 'Cuộn (500 tem)',
    current_stock: 8,
    min_stock: 3,
    cost_price: 180000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-5',
    name: 'Sữa Tươi Thanh Trùng Dalat Milk',
    sku: 'MILK-DALAT',
    category: 'Nguyên liệu pha chế',
    unit: 'Chai 950ml',
    current_stock: 18,
    min_stock: 6,
    cost_price: 38000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-6',
    name: 'Cuộn Tem Decal QR Tích Điểm (50x30mm)',
    sku: 'LBL-QR-5030',
    category: 'Vật tư quầy',
    unit: 'Cuộn 1000 tem',
    current_stock: 6,
    min_stock: 2,
    cost_price: 75000,
    status: 'IN_STOCK',
    updated_at: new Date().toISOString(),
  },
  {
    id: 'inv-7',
    name: 'Kem Cheese / Phô Mai Kem Anchor',
    sku: 'CHZ-ANC-01',
    category: 'Nguyên liệu pha chế',
    unit: 'Hộp 1kg',
    current_stock: 2,
    min_stock: 4,
    cost_price: 210000,
    status: 'LOW_STOCK',
    updated_at: new Date().toISOString(),
  },
];

// Product availability overrides
let productAvailability: Record<string, boolean> = {};

// GET /api/admin/products
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const adminClient = createAdminClient();

    // Query categories from database if available, else fallback to menuData
    const { data: dbCategories } = await adminClient
      .from('menu_categories')
      .select('*')
      .order('sort_order', { ascending: true });

    // Format products list
    const products = menuData.flatMap((cat) =>
      cat.items.map((item) => ({
        ...item,
        categoryName: cat.name,
        categorySlug: cat.slug,
        is_available: productAvailability[item.id] !== undefined ? productAvailability[item.id] : true,
      }))
    );

    const categories = (dbCategories && dbCategories.length > 0)
      ? dbCategories.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          itemCount: products.filter((p) => p.categorySlug === c.slug).length,
        }))
      : menuData.map((c, idx) => ({
          id: `cat-${idx + 1}`,
          name: c.name,
          slug: c.slug,
          itemCount: c.items.length,
        }));

    return NextResponse.json({
      products,
      categories,
      inventory: inventoryItems,
      metrics: {
        totalProducts: products.length,
        totalCategories: categories.length,
        lowStockItems: inventoryItems.filter((i) => i.current_stock <= i.min_stock).length,
      },
    });
  } catch (err: any) {
    console.error('Products API error:', err);
    return NextResponse.json({ error: 'Lỗi tải dữ liệu sản phẩm' }, { status: 500 });
  }
}

// POST /api/admin/products — Update availability or inventory
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Không có quyền truy cập' }, { status: 403 });
    }

    const body = await request.json();
    const { action, productId, isAvailable, inventoryId, adjustment } = body;

    if (action === 'TOGGLE_AVAILABILITY' && productId) {
      productAvailability[productId] = Boolean(isAvailable);
      return NextResponse.json({ success: true, productId, is_available: productAvailability[productId] });
    }

    if (action === 'ADJUST_STOCK' && inventoryId && adjustment !== undefined) {
      const item = inventoryItems.find((i) => i.id === inventoryId);
      if (!item) {
        return NextResponse.json({ error: 'Không tìm thấy mặt hàng trong kho' }, { status: 404 });
      }

      item.current_stock = Math.max(0, item.current_stock + parseInt(adjustment, 10));
      item.status = item.current_stock === 0 ? 'OUT_OF_STOCK' : (item.current_stock <= item.min_stock ? 'LOW_STOCK' : 'IN_STOCK');
      item.updated_at = new Date().toISOString();

      return NextResponse.json({ success: true, item });
    }

    return NextResponse.json({ error: 'Hành động không hợp lệ' }, { status: 400 });
  } catch (err: any) {
    console.error('Products API update error:', err);
    return NextResponse.json({ error: 'Lỗi cập nhật sản phẩm' }, { status: 500 });
  }
}
