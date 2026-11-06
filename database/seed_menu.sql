-- ============================================================
-- SEED DATA: Menu items
-- Categories: Cold Brew, Matcha, Cold Brew Chai
-- Run this AFTER schema.sql has been executed
-- ============================================================

DO $$
DECLARE
  v_matcha_id UUID;
  v_coldbrew_id UUID;
  v_chai_id UUID;
  v_item_id UUID;
BEGIN
  -- Ensure categories exist
  INSERT INTO menu_categories (name, slug, sort_order)
  VALUES ('Cold Brew', 'cold-brew', 1)
  ON CONFLICT (slug) DO UPDATE SET name = 'Cold Brew', sort_order = 1
  RETURNING id INTO v_coldbrew_id;

  INSERT INTO menu_categories (name, slug, sort_order)
  VALUES ('Matcha', 'matcha', 2)
  ON CONFLICT (slug) DO UPDATE SET name = 'Matcha', sort_order = 2
  RETURNING id INTO v_matcha_id;

  -- Rename old canned category if present, or upsert cold-brew-chai
  UPDATE menu_categories
  SET name = 'Cold Brew Chai', slug = 'cold-brew-chai', sort_order = 3
  WHERE slug = 'cold-brew-dong-lon';

  INSERT INTO menu_categories (name, slug, sort_order)
  VALUES ('Cold Brew Chai', 'cold-brew-chai', 3)
  ON CONFLICT (slug) DO UPDATE SET name = 'Cold Brew Chai', sort_order = 3
  RETURNING id INTO v_chai_id;

  -- Unlink inventory_items before refreshing menu_items if needed
  UPDATE inventory_items SET linked_menu_item_id = NULL WHERE linked_menu_item_id IN (
    SELECT id FROM menu_items WHERE category_id IN (v_coldbrew_id, v_matcha_id, v_chai_id)
  );

  -- Clear previous items under these categories to re-seed cleanly
  DELETE FROM menu_items WHERE category_id IN (v_coldbrew_id, v_matcha_id, v_chai_id);

  -- ═══════════════════════════════════
  -- 1. COLD BREW
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_coldbrew_id, 'Original Cold Brew', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  INSERT INTO menu_items (category_id, name, is_signature, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Cam Sả', TRUE, 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 35000, 1), (v_item_id, 'L', 40000, 2);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Chanh Vàng', 3) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Nước Dừa', 4) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  -- ═══════════════════════════════════
  -- 2. MATCHA (Only Size M)
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_matcha_id, 'Matcha Latte', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 40000, 1);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_matcha_id, 'Matcha Coco', 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 40000, 1);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_matcha_id, 'Matcha Oat', 3) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 40000, 1);

  INSERT INTO menu_items (category_id, name, is_signature, sort_order)
  VALUES (v_matcha_id, 'Matcha Cold Whisk', TRUE, 4) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_matcha_id, 'Strawberry Matcha Latte', 5) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  INSERT INTO menu_items (category_id, name, sort_order)
  VALUES (v_matcha_id, 'Matcha Kem Muối', 6) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  -- ═══════════════════════════════════
  -- 3. COLD BREW CHAI
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_chai_id, 'Cold Brew Chanh Vàng', 'Hạn dùng: 5 – 7 ngày', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'Chai', 74000, 1);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_chai_id, 'Pure Black Cold Brew', 'Hạn dùng: 7 – 10 ngày', 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'Chai', 69000, 1);

  RAISE NOTICE 'Menu seed completed successfully!';
END $$;
