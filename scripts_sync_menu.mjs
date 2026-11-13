import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const client = createClient(supabaseUrl, serviceKey);

const menuData = [
  {
    name: 'Cold Brew',
    slug: 'cold-brew',
    sort_order: 1,
    items: [
      {
        name: 'Original Cold Brew',
        description: 'Cà phê ủ lạnh 18h',
        sort_order: 1,
        sizes: [
          { size_label: 'M', price: 30000, sort_order: 1 },
          { size_label: 'L', price: 35000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Cam Sả',
        description: 'Hương cam vàng kết hợp sả thanh nhẹ',
        sort_order: 2,
        is_signature: true,
        sizes: [
          { size_label: 'M', price: 35000, sort_order: 1 },
          { size_label: 'L', price: 40000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Dâu Tằm',
        description: 'Vị ngọt thanh từ dâu tằm tự nhiên',
        sort_order: 3,
        sizes: [
          { size_label: 'M', price: 35000, sort_order: 1 },
          { size_label: 'L', price: 40000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Strawberry',
        description: 'Hòa quyện dâu tây chua ngọt thanh mát',
        sort_order: 4,
        sizes: [
          { size_label: 'M', price: 35000, sort_order: 1 },
          { size_label: 'L', price: 40000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Bưởi Hồng',
        description: 'Hương bưởi hồng tươi mới, sảng khoái',
        sort_order: 5,
        sizes: [
          { size_label: 'M', price: 35000, sort_order: 1 },
          { size_label: 'L', price: 40000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Vải',
        description: 'Hương vải thiều ngọt thanh, thơm mát',
        sort_order: 6,
        sizes: [
          { size_label: 'M', price: 35000, sort_order: 1 },
          { size_label: 'L', price: 40000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Chanh Vàng',
        description: 'Cà phê ủ lạnh dùng với syrup chanh vàng',
        sort_order: 7,
        sizes: [
          { size_label: 'M', price: 30000, sort_order: 1 },
          { size_label: 'L', price: 35000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Nước Dừa',
        description: 'Cà phê ủ lạnh dùng với nước dừa tươi',
        sort_order: 8,
        sizes: [
          { size_label: 'M', price: 30000, sort_order: 1 },
          { size_label: 'L', price: 35000, sort_order: 2 },
        ],
      },
    ],
  },
  {
    name: 'Matcha',
    slug: 'matcha',
    sort_order: 2,
    items: [
      {
        name: 'Matcha Latte',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        sort_order: 1,
        sizes: [{ size_label: 'M', price: 40000, sort_order: 1 }],
      },
      {
        name: 'Matcha Kem Béo',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        sort_order: 2,
        is_signature: true,
        sizes: [{ size_label: 'M', price: 45000, sort_order: 1 }],
      },
      {
        name: 'Strawberry Matcha',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        sort_order: 3,
        sizes: [{ size_label: 'M', price: 45000, sort_order: 1 }],
      },
      {
        name: 'Matcha Coco',
        description: '5g matcha kết hợp với nước dừa',
        sort_order: 4,
        sizes: [{ size_label: 'M', price: 40000, sort_order: 1 }],
      },
      {
        name: 'Matcha Cold Whisk',
        description: '7g matcha đánh lạnh · Sữa thanh trùng / Sữa Oat',
        sort_order: 5,
        is_signature: true,
        sizes: [{ size_label: 'M', price: 45000, sort_order: 1 }],
      },
    ],
  },
  {
    name: 'Cold Brew Chai',
    slug: 'cold-brew-chai',
    sort_order: 3,
    items: [
      {
        name: 'Cold Brew Chanh Vàng',
        description: 'Bottled Craft · Cà phê ủ lạnh chanh vàng đóng chai',
        sort_order: 1,
        sizes: [{ size_label: 'Chai', price: 75000, sort_order: 1 }],
      },
      {
        name: 'Pure Black Cold Brew',
        description: 'Zero Sugar · Cà phê ủ lạnh nguyên bản đóng chai',
        sort_order: 2,
        sizes: [{ size_label: 'Chai', price: 70000, sort_order: 1 }],
      },
    ],
  },
];

async function sync() {
  console.log('--- Checking Historical Revenue Before Sync ---');
  const { data: beforeOrders } = await client
    .from('orders')
    .select('id, status, total_due');
  const confirmedBefore = (beforeOrders || []).filter((o) => o.status === 'CONFIRMED');
  const totalRevBefore = confirmedBefore.reduce((s, o) => s + (Number(o.total_due) || 0), 0);
  console.log(`Confirmed Orders Before: ${confirmedBefore.length} | Total Revenue: ${totalRevBefore.toLocaleString('vi-VN')}đ`);

  console.log('\n--- Syncing Categories & Menu Items In-Place ---');
  for (const cat of menuData) {
    const { data: existing } = await client
      .from('menu_categories')
      .select('id')
      .eq('slug', cat.slug)
      .maybeSingle();

    let catId = existing?.id;
    if (!catId) {
      const { data: created, error } = await client
        .from('menu_categories')
        .insert({ name: cat.name, slug: cat.slug, sort_order: cat.sort_order })
        .select('id')
        .single();
      if (error) console.error('Error inserting category:', cat.slug, error);
      catId = created?.id;
    } else {
      await client
        .from('menu_categories')
        .update({ name: cat.name, sort_order: cat.sort_order })
        .eq('id', catId);
    }

    console.log(`Category: ${cat.name} (${cat.slug}) -> ${catId}`);

    const { data: existingCatItems } = await client
      .from('menu_items')
      .select('id, name')
      .eq('category_id', catId);

    const keptIds = new Set();

    for (const item of cat.items) {
      const match = (existingCatItems || []).find(
        (ei) =>
          ei.name.trim().toLowerCase() === item.name.trim().toLowerCase() ||
          (item.name === 'Strawberry Matcha Latte' && ei.name.trim().toLowerCase() === 'strawberry matcha')
      );

      let itemId = match?.id;
      if (itemId) {
        await client
          .from('menu_items')
          .update({
            name: item.name,
            description: item.description || null,
            is_signature: Boolean(item.is_signature),
            is_available: true,
            sort_order: item.sort_order,
          })
          .eq('id', itemId);
      } else {
        const { data: insertedItem, error: itemErr } = await client
          .from('menu_items')
          .insert({
            category_id: catId,
            name: item.name,
            description: item.description || null,
            is_signature: Boolean(item.is_signature),
            is_available: true,
            sort_order: item.sort_order,
          })
          .select('id')
          .single();

        if (itemErr) {
          console.error('Error inserting item:', item.name, itemErr);
          continue;
        }
        itemId = insertedItem.id;
      }

      keptIds.add(itemId);

      // Replace sizes for this item with the exact new template sizes & prices
      await client.from('menu_item_sizes').delete().eq('menu_item_id', itemId);

      const sizesToInsert = item.sizes.map((s) => ({
        menu_item_id: itemId,
        size_label: s.size_label,
        price: s.price,
        is_available: true,
        sort_order: s.sort_order,
      }));

      const { error: sizeErr } = await client
        .from('menu_item_sizes')
        .insert(sizesToInsert);

      if (sizeErr) console.error('Error inserting sizes for:', item.name, sizeErr);
      else console.log(`  ✓ Synced: ${item.name} -> ${item.sizes.map((s) => `${s.size_label}: ${s.price}`).join(', ')}`);
    }

    // Remove obsolete items in this category
    for (const oldItem of existingCatItems || []) {
      if (!keptIds.has(oldItem.id)) {
        await client
          .from('inventory_items')
          .update({ linked_menu_item_id: null })
          .eq('linked_menu_item_id', oldItem.id);
        await client.from('menu_items').delete().eq('id', oldItem.id);
        console.log(`  - Removed obsolete menu item: ${oldItem.name}`);
      }
    }
  }

  // Remove obsolete category cold-brew-dong-lon if present
  const { data: oldCanCat } = await client
    .from('menu_categories')
    .select('id, name, slug')
    .eq('slug', 'cold-brew-dong-lon')
    .maybeSingle();

  if (oldCanCat?.id) {
    const { data: oldCanItems } = await client
      .from('menu_items')
      .select('id, name')
      .eq('category_id', oldCanCat.id);
    for (const oi of oldCanItems || []) {
      await client
        .from('inventory_items')
        .update({ linked_menu_item_id: null })
        .eq('linked_menu_item_id', oi.id);
      await client.from('menu_items').delete().eq('id', oi.id);
      console.log(`  - Removed obsolete item in ${oldCanCat.slug}: ${oi.name}`);
    }
    await client.from('menu_categories').delete().eq('id', oldCanCat.id);
    console.log(`  - Removed obsolete category: ${oldCanCat.name} (${oldCanCat.slug})`);
  }

  console.log('\n--- Verifying Historical Revenue After Sync ---');
  const { data: afterOrders } = await client
    .from('orders')
    .select('id, status, total_due');
  const confirmedAfter = (afterOrders || []).filter((o) => o.status === 'CONFIRMED');
  const totalRevAfter = confirmedAfter.reduce((s, o) => s + (Number(o.total_due) || 0), 0);
  console.log(`Confirmed Orders After: ${confirmedAfter.length} | Total Revenue: ${totalRevAfter.toLocaleString('vi-VN')}đ`);
}

sync().catch(console.error);
