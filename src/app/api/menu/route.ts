import { NextResponse } from 'next/server';
import { getPosMenuCatalog } from '@/lib/pos/repository';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const catalog = await getPosMenuCatalog();
    return NextResponse.json({
      categories: catalog.categories,
    });
  } catch (err) {
    console.error('GET /api/menu error:', err);
    return NextResponse.json(
      { error: 'Không thể tải dữ liệu thực đơn.' },
      { status: 500 }
    );
  }
}

