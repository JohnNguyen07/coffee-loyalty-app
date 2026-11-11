-- ============================================================
-- SEED DATA: Menu items (Synced with latest Ủ LAB Menu)
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
  -- 1. COLD BREW (Size M / Size L)
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Original Cold Brew', 'Cà phê ủ lạnh 18h', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  INSERT INTO menu_items (category_id, name, description, is_signature, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Cam Sả', 'Hương cam vàng kết hợp sả thanh nhẹ', TRUE, 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 35000, 1), (v_item_id, 'L', 40000, 2);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Dâu Tằm', 'Vị ngọt thanh từ dâu tằm tự nhiên', 3) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 35000, 1), (v_item_id, 'L', 40000, 2);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Strawberry', 'Hòa quyện dâu tây chua ngọt thanh mát', 4) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 35000, 1), (v_item_id, 'L', 40000, 2);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Bưởi Hồng', 'Hương bưởi hồng tươi mới, sảng khoái', 5) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 35000, 1), (v_item_id, 'L', 40000, 2);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Chanh Vàng', 'Cà phê ủ lạnh dùng với syrup chanh vàng', 6) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_coldbrew_id, 'Cold Brew Nước Dừa', 'Cà phê ủ lạnh dùng với nước dừa tươi', 7) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 30000, 1), (v_item_id, 'L', 35000, 2);

  -- ═══════════════════════════════════
  -- 2. MATCHA (Only Size M)
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_matcha_id, 'Matcha Latte', '5g matcha · Sữa thanh trùng / Sữa Oat', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 40000, 1);

  INSERT INTO menu_items (category_id, name, description, is_signature, sort_order)
  VALUES (v_matcha_id, 'Matcha Kem Béo', '5g matcha · Sữa thanh trùng / Sữa Oat', TRUE, 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_matcha_id, 'Strawberry Matcha', '5g matcha · Sữa thanh trùng / Sữa Oat', 3) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_matcha_id, 'Matcha Coco', '5g matcha kết hợp với nước dừa', 4) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 40000, 1);

  INSERT INTO menu_items (category_id, name, description, is_signature, sort_order)
  VALUES (v_matcha_id, 'Matcha Cold Whisk', '7g matcha đánh lạnh · Sữa thanh trùng / Sữa Oat', TRUE, 5) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'M', 45000, 1);

  -- ═══════════════════════════════════
  -- 3. COLD BREW CHAI
  -- ═══════════════════════════════════

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_chai_id, 'Cold Brew Chanh Vàng', 'Bottled Craft · Bảo quản lạnh: 5–7 ngày', 1) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'Chai', 90000, 1);

  INSERT INTO menu_items (category_id, name, description, sort_order)
  VALUES (v_chai_id, 'Pure Black Cold Brew', 'Zero Sugar · Bảo quản lạnh: 7–10 ngày', 2) RETURNING id INTO v_item_id;
  INSERT INTO menu_item_sizes (menu_item_id, size_label, price, sort_order) VALUES
    (v_item_id, 'Chai', 80000, 1);

  RAISE NOTICE 'Menu seed completed successfully!';
END $$;
