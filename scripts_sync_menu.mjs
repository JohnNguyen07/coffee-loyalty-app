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
        sort_order: 1,
        sizes: [
          { size_label: 'M', price: 29000, sort_order: 1 },
          { size_label: 'L', price: 34000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Cam Sả',
        sort_order: 2,
        sizes: [
          { size_label: 'M', price: 34000, sort_order: 1 },
          { size_label: 'L', price: 39000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Vải',
        sort_order: 3,
        sizes: [
          { size_label: 'M', price: 34000, sort_order: 1 },
          { size_label: 'L', price: 39000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Chanh Vàng',
        sort_order: 4,
        sizes: [
          { size_label: 'M', price: 29000, sort_order: 1 },
          { size_label: 'L', price: 34000, sort_order: 2 },
        ],
      },
      {
        name: 'Cold Brew Nước Dừa',
        sort_order: 5,
        sizes: [
          { size_label: 'M', price: 29000, sort_order: 1 },
          { size_label: 'L', price: 34000, sort_order: 2 },
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
        sort_order: 1,
        sizes: [
          { size_label: 'M', price: 34000, sort_order: 1 },
          { size_label: 'L', price: 39000, sort_order: 2 },
        ],
      },
      {
        name: 'Matcha Coco',
        sort_order: 2,
        sizes: [
          { size_label: 'M', price: 34000, sort_order: 1 },
          { size_label: 'L', price: 39000, sort_order: 2 },
        ],
      },
      {
        name: 'Matcha Oat',
        sort_order: 3,
        sizes: [
          { size_label: 'M', price: 34000, sort_order: 1 },
          { size_label: 'L', price: 39000, sort_order: 2 },
        ],
      },
      {
        name: 'Matcha Cold Whisk',
        sort_order: 4,
        is_signature: true,
        sizes: [
          { size_label: 'M', price: 42000, sort_order: 1 },
          { size_label: 'L', price: 46000, sort_order: 2 },
        ],
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
        description: 'Hạn dùng: 5 – 7 ngày',
        sort_order: 1,
        sizes: [
          { size_label: 'Chai', price: 74000, sort_order: 1 },
        ],
      },
      {
        name: 'Pure Black Cold Brew',
        description: 'Hạn dùng: 7 – 10 ngày',
        sort_order: 2,
        sizes: [
          { size_label: 'Chai', price: 69000, sort_order: 1 },
        ],
      },
    ],
  },
];

async function sync() {
  console.log('--- Syncing Categories ---');
  // Rename old category if present
  await client
    .from('menu_categories')
    .update({ name: 'Cold Brew Chai', slug: 'cold-brew-chai', sort_order: 3 })
    .eq('slug', 'cold-brew-dong-lon');

  // Upsert categories
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

    // Remove existing items in this category
    const { error: delErr } = await client
      .from('menu_items')
      .delete()
      .eq('category_id', catId);
    if (delErr) console.error('Error clearing old items:', delErr);

    // Insert new items
    for (const item of cat.items) {
      const { data: insertedItem, error: itemErr } = await client
        .from('menu_items')
        .insert({
          category_id: catId,
          name: item.name,
          description: item.description || null,
          is_signature: Boolean(item.is_signature),
          sort_order: item.sort_order,
        })
        .select('id')
        .single();

      if (itemErr) {
        console.error('Error inserting item:', item.name, itemErr);
        continue;
      }

      // Insert sizes
      const sizesToInsert = item.sizes.map((s) => ({
        menu_item_id: insertedItem.id,
        size_label: s.size_label,
        price: s.price,
        sort_order: s.sort_order,
      }));

      const { error: sizeErr } = await client
        .from('menu_item_sizes')
        .insert(sizesToInsert);

      if (sizeErr) console.error('Error inserting sizes for:', item.name, sizeErr);
      else console.log(`  + Inserted: ${item.name} (${item.sizes.length} sizes)`);
    }
  }

  console.log('Sync finished successfully!');
}

sync().catch(console.error);
