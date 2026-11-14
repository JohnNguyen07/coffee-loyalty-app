import fs from 'node:fs';
import path from 'node:path';
import { createAdminClient } from '@/lib/supabase/admin';
import { escapeFilterInput, type PosStaffContext } from '@/lib/auth-utils';
import { menuData, allMenuItems, type MenuCategory, type MenuItem } from '@/data/menu';
import { processPosOrderInventory, reversePosOrderInventory } from '@/lib/inventory/pos-integration';
import { buildUserRbacProfile } from '@/lib/rbac/domain';
import { getBusinessProfile, listLocationsForUser } from '@/lib/rbac/repository';
import { getActiveShiftSession } from '@/lib/revenue/repository';
import {
  ADDON_OPTIONS,
  DEFAULT_LOCATION_ID,
  ICE_OPTIONS,
  SWEETNESS_OPTIONS,
  calculatePosOrderTotals,
  extractPosOrderMetadata,
  formatItemOptionsSummary,
  generatePosOrderCode,
  normalizeFulfillmentStatus,
  resolveTierCashbackRate,
  serializePosFallbackNote,
  validateFulfillmentTransition,
  validateMenuProductInput,
  validatePosOrderCancel,
  validateShippingFeeInput,
  type DiscountType,
  type FulfillmentStatus,
  type NormalizedPosOrderItem,
  type OrderType,
  type PaymentMethod,
  type PosCartItemInput,
} from './domain';

interface DbSizeRow {
  size_label: string;
  price: number;
  sort_order?: number;
  is_available?: boolean;
}

export interface CreatePosOrderPayload {
  items: PosCartItemInput[];
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  discount?: {
    type: DiscountType;
    value: number;
    reason?: string;
  };
  customerPhone?: string;
  customerName?: string;
  pointsUsed?: number;
  note?: string;
  idempotencyKey?: string;
  linkedOrderId?: string;
  linkedOrderCode?: string;
  shippingFee?: number;
  customerAddress?: string;
}

export interface PosOrderRecord {
  id: string;
  orderCode: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  fulfillmentStatus: FulfillmentStatus;
  channel: 'POS' | 'WEB';
  orderType: OrderType;
  paymentMethod: PaymentMethod;
  paymentStatus: 'PAID' | 'UNPAID' | 'REFUNDED';
  subtotal: number;
  discountAmount: number;
  discountPercent: number;
  discountReason?: string;
  pointsUsed: number;
  shippingFee: number;
  customerAddress?: string;
  linkedOrderId?: string;
  linkedOrderCode?: string;
  totalDue: number;
  amountReceived: number;
  changeDue: number;
  customerName: string;
  customerPhone: string;
  cashierName: string;
  locationId?: string;
  note: string;
  cancelReason?: string;
  cancelledBy?: string;
  qrTokenCode?: string;
  pointsEarned?: number;
  memberPointBalance?: number;
  createdAt: string;
  confirmedAt?: string | null;
  cancelledAt?: string | null;
  items: {
    id?: string;
    productName: string;
    sizeLabel: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    optionsSummary: string;
    options?: {
      sweetness?: string;
      ice?: string;
      addons?: { id: string; name: string; price: number }[];
    };
    itemNote?: string;
  }[];
}

export interface OrderAuditLogItem {
  id: string;
  orderId: string;
  orderCode: string;
  action: string;
  actorName: string;
  actorRole: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface PosLocationContextInfo {
  location: {
    locationId: string;
    locationName: string;
    address?: string;
    phone?: string;
    receiptFooter?: string;
  };
  activeShift: {
    isOpen: boolean;
    shiftId?: string;
    shiftCode?: string;
    shiftName?: string;
    openedAt?: string;
    openedByName?: string;
  };
}

interface PersistedCustomProduct {
  id: string;
  name: string;
  category: string;
  categorySlug: string;
  description?: string;
  shelfLife?: string;
  isSignature?: boolean;
  badgeLabel?: string;
  sizes: { label: string; price: number }[];
  isAvailable: boolean;
  deleted?: boolean;
}

interface PersistedPosStore {
  availability: Record<string, boolean>;
  priceOverrides: Record<string, { label: string; price: number }[]>;
  productMetaOverrides: Record<
    string,
    {
      name?: string;
      description?: string;
      shelfLife?: string;
      isSignature?: boolean;
      badgeLabel?: string;
    }
  >;
  customProducts: Record<string, PersistedCustomProduct>;
  orderFulfillment: Record<
    string,
    {
      fulfillmentStatus: FulfillmentStatus;
      shippingFee?: number;
      updatedAt: string;
    }
  >;
  auditLogs: Record<string, OrderAuditLogItem[]>;
  updatedAt: string;
}

const POS_STORE_DIR = path.join(process.cwd(), '.data');
const POS_STORE_PATH = path.join(POS_STORE_DIR, 'pos-store.json');

declare global {
  var __ulabPosStore: PersistedPosStore | undefined;
}

function getEmptyPosStore(): PersistedPosStore {
  return {
    availability: {},
    priceOverrides: {},
    productMetaOverrides: {},
    customProducts: {},
    orderFulfillment: {},
    auditLogs: {},
    updatedAt: new Date().toISOString(),
  };
}

function readPosStore(): PersistedPosStore {
  if (globalThis.__ulabPosStore) {
    return globalThis.__ulabPosStore;
  }
  try {
    if (fs.existsSync(POS_STORE_PATH)) {
      const raw = fs.readFileSync(POS_STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedPosStore>;
      const hydrated: PersistedPosStore = {
        availability: parsed.availability || {},
        priceOverrides: parsed.priceOverrides || {},
        productMetaOverrides: parsed.productMetaOverrides || {},
        customProducts: parsed.customProducts || {},
        orderFulfillment: parsed.orderFulfillment || {},
        auditLogs: parsed.auditLogs || {},
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
      globalThis.__ulabPosStore = hydrated;
      return hydrated;
    }
  } catch (err) {
    console.warn('readPosStore fallback:', err);
  }
  const empty = getEmptyPosStore();
  globalThis.__ulabPosStore = empty;
  return empty;
}

function writePosStore(store: PersistedPosStore): void {
  store.updatedAt = new Date().toISOString();
  globalThis.__ulabPosStore = store;
  try {
    if (!fs.existsSync(POS_STORE_DIR)) {
      fs.mkdirSync(POS_STORE_DIR, { recursive: true });
    }
    fs.writeFileSync(POS_STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('writePosStore warning:', err);
  }
}

export function getPersistedOrderFulfillmentMap(): Record<
  string,
  { fulfillmentStatus: FulfillmentStatus; shippingFee?: number; updatedAt: string }
> {
  return readPosStore().orderFulfillment;
}

export function matchesOrderLocation(rowLocationId: unknown, targetLocationId?: string): boolean {
  if (!targetLocationId) return true;
  const target = targetLocationId.trim();
  const rowLoc = typeof rowLocationId === 'string' && rowLocationId.trim() ? rowLocationId.trim() : null;
  if (target === DEFAULT_LOCATION_ID) {
    return !rowLoc || rowLoc === DEFAULT_LOCATION_ID;
  }
  return rowLoc === target;
}

// Track recent idempotency keys in memory as a secondary guard when DB column is not migrated yet
const recentIdempotencyCache = new Map<string, PosOrderRecord>();

// Global in-memory cache mirrored from .data/pos-store.json
const globalProductAvailability = new Map<string, boolean>();
const globalProductPriceOverrides = new Map<string, Map<string, number>>();

function syncMemoryCachesFromStore(): PersistedPosStore {
  const store = readPosStore();
  Object.entries(store.availability).forEach(([pid, avail]) => {
    if (!globalProductAvailability.has(pid)) {
      globalProductAvailability.set(pid, avail);
    }
  });
  Object.entries(store.priceOverrides).forEach(([pid, sizes]) => {
    if (!globalProductPriceOverrides.has(pid) && Array.isArray(sizes)) {
      const m = new Map<string, number>();
      sizes.forEach((s) => m.set(s.label, s.price));
      globalProductPriceOverrides.set(pid, m);
    }
  });
  return store;
}

export function getProductAvailabilityMap(): Record<string, boolean> {
  syncMemoryCachesFromStore();
  const result: Record<string, boolean> = {};
  globalProductAvailability.forEach((v, k) => {
    result[k] = v;
  });
  return result;
}

export function isProductAvailable(productId: string): boolean {
  syncMemoryCachesFromStore();
  if (globalProductAvailability.has(productId)) {
    return globalProductAvailability.get(productId) === true;
  }
  return true;
}

export async function setProductAvailability(
  productId: string,
  isAvailable: boolean
): Promise<boolean> {
  globalProductAvailability.set(productId, isAvailable);
  const store = readPosStore();
  store.availability[productId] = isAvailable;
  if (store.customProducts[productId]) {
    store.customProducts[productId].isAvailable = isAvailable;
  }
  writePosStore(store);

  try {
    const adminClient = createAdminClient();
    const staticItem = allMenuItems.find((m) => m.id === productId);
    if (staticItem) {
      const { data: dbCat } = await adminClient
        .from('menu_categories')
        .select('id')
        .eq('slug', staticItem.categorySlug)
        .maybeSingle();

      let query = adminClient
        .from('menu_items')
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .ilike('name', staticItem.name);

      if (dbCat?.id) {
        query = query.eq('category_id', dbCat.id);
      }

      await query;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(productId)) {
      await adminClient
        .from('menu_items')
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .eq('id', productId);
    }
  } catch (err) {
    console.warn('DB menu_items availability update fallback:', err);
  }

  return true;
}

export async function setProductPrices(
  productId: string,
  sizes: { label: string; price: number }[]
): Promise<boolean> {
  const cleanSizes = sizes.map((s) => ({
    label: String(s.label || 'M').trim(),
    price: Math.max(1000, Math.round(Number(s.price) || 0)),
  }));
  const sizeMap = new Map<string, number>();
  cleanSizes.forEach((s) => sizeMap.set(s.label, s.price));
  globalProductPriceOverrides.set(productId, sizeMap);

  const store = readPosStore();
  store.priceOverrides[productId] = cleanSizes;
  if (store.customProducts[productId]) {
    store.customProducts[productId].sizes = cleanSizes;
  }
  writePosStore(store);

  try {
    const adminClient = createAdminClient();
    const staticItem = allMenuItems.find((m) => m.id === productId);
    let targetDbId: string | null = null;

    if (staticItem) {
      const { data: dbCat } = await adminClient
        .from('menu_categories')
        .select('id')
        .eq('slug', staticItem.categorySlug)
        .maybeSingle();

      let query = adminClient
        .from('menu_items')
        .select('id')
        .ilike('name', staticItem.name);

      if (dbCat?.id) {
        query = query.eq('category_id', dbCat.id);
      }

      const { data: dbItems } = await query;
      targetDbId = dbItems?.[0]?.id ? String(dbItems[0].id) : null;
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(productId)) {
      targetDbId = productId;
    }

    if (targetDbId) {
      await adminClient.from('menu_item_sizes').delete().eq('menu_item_id', targetDbId);
      await adminClient.from('menu_item_sizes').insert(
        cleanSizes.map((s, idx) => ({
          menu_item_id: targetDbId,
          size_label: s.label,
          price: s.price,
          is_available: true,
          sort_order: idx + 1,
        }))
      );
    }
  } catch (err) {
    console.warn('DB menu_item_sizes price update fallback:', err);
  }

  return true;
}

export function getProductPriceOverridesMap(): Record<string, { label: string; price: number }[]> {
  syncMemoryCachesFromStore();
  const result: Record<string, { label: string; price: number }[]> = {};
  globalProductPriceOverrides.forEach((map, pid) => {
    const arr: { label: string; price: number }[] = [];
    map.forEach((price, label) => arr.push({ label, price }));
    result[pid] = arr;
  });
  return result;
}

const CATEGORY_NAME_BY_SLUG: Record<string, string> = {
  'cold-brew': 'Cold Brew',
  matcha: 'Matcha',
  'cold-brew-chai': 'Cold Brew Chai',
};

/**
 * Create or update a menu beverage item across Supabase (`menu_items`/`menu_item_sizes`)
 * and resilient `.data/pos-store.json`.
 */
export async function upsertMenuProduct(input: {
  id?: string;
  name: string;
  categorySlug: string;
  sizes: { label: string; price: number }[];
  isSignature?: boolean;
  shelfLife?: string;
  description?: string;
  isAvailable?: boolean;
}): Promise<{ success: boolean; error?: string; product?: PersistedCustomProduct }> {
  const cleanSizes = Array.isArray(input.sizes)
    ? input.sizes.map((s) => ({
        label: String(s.label || 'M').trim(),
        price: Math.max(1000, Math.round(Number(s.price) || 0)),
      }))
    : [];

  const check = validateMenuProductInput({
    name: input.name,
    categorySlug: input.categorySlug,
    sizes: cleanSizes,
    isSignature: input.isSignature,
    shelfLife: input.shelfLife,
    description: input.description,
  });

  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const cleanName = input.name.trim();
  const categoryName = CATEGORY_NAME_BY_SLUG[input.categorySlug] || 'Matcha';
  const cleanDesc = (input.description || input.shelfLife || '').trim() || undefined;
  const cleanShelf = input.shelfLife?.trim() || undefined;
  const isAvailable = input.isAvailable !== false;
  const productId = input.id?.trim() || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const store = readPosStore();
  let resolvedId = productId;

  try {
    const adminClient = createAdminClient();
    const { data: catRow } = await adminClient
      .from('menu_categories')
      .select('id, name, slug')
      .eq('slug', input.categorySlug)
      .maybeSingle();

    const staticMatch = allMenuItems.find((m) => m.id === productId);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(productId);

    if (input.id && (staticMatch || isUuid)) {
      let targetDbId: string | null = isUuid ? productId : null;
      if (!targetDbId && staticMatch) {
        const { data: existingRows } = await adminClient
          .from('menu_items')
          .select('id')
          .ilike('name', staticMatch.name)
          .limit(1);
        targetDbId = existingRows?.[0]?.id ? String(existingRows[0].id) : null;
      }

      if (targetDbId) {
        await adminClient
          .from('menu_items')
          .update({
            name: cleanName,
            description: cleanDesc || null,
            is_signature: Boolean(input.isSignature),
            is_available: isAvailable,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetDbId);

        await adminClient.from('menu_item_sizes').delete().eq('menu_item_id', targetDbId);
        await adminClient.from('menu_item_sizes').insert(
          cleanSizes.map((sz, idx) => ({
            menu_item_id: targetDbId,
            size_label: sz.label,
            price: sz.price,
            is_available: true,
            sort_order: idx + 1,
          }))
        );
      }
    } else if (!input.id && catRow) {
      const { data: insertedItem, error: insertErr } = await adminClient
        .from('menu_items')
        .insert({
          category_id: catRow.id,
          name: cleanName,
          description: cleanDesc || null,
          is_signature: Boolean(input.isSignature),
          is_available: isAvailable,
          sort_order: 99,
        })
        .select('*')
        .maybeSingle();

      if (!insertErr && insertedItem?.id) {
        resolvedId = String(insertedItem.id);
        await adminClient.from('menu_item_sizes').insert(
          cleanSizes.map((sz, idx) => ({
            menu_item_id: resolvedId,
            size_label: sz.label,
            price: sz.price,
            is_available: true,
            sort_order: idx + 1,
          }))
        );
      }
    }
  } catch (err) {
    console.warn('upsertMenuProduct DB fallback:', err);
  }

  const sizeMap = new Map<string, number>();
  cleanSizes.forEach((s) => sizeMap.set(s.label, s.price));
  globalProductPriceOverrides.set(resolvedId, sizeMap);
  globalProductAvailability.set(resolvedId, isAvailable);

  store.priceOverrides[resolvedId] = cleanSizes;
  store.availability[resolvedId] = isAvailable;
  store.productMetaOverrides[resolvedId] = {
    name: cleanName,
    description: cleanDesc,
    shelfLife: cleanShelf,
    isSignature: Boolean(input.isSignature),
    badgeLabel: input.isSignature ? 'Signature' : undefined,
  };

  const isExistingStatic = allMenuItems.some((m) => m.id === resolvedId);
  const productDto: PersistedCustomProduct = {
    id: resolvedId,
    name: cleanName,
    category: categoryName,
    categorySlug: input.categorySlug,
    description: cleanDesc,
    shelfLife: cleanShelf,
    isSignature: Boolean(input.isSignature),
    badgeLabel: input.isSignature ? 'Signature' : undefined,
    sizes: cleanSizes,
    isAvailable,
  };

  if (!isExistingStatic) {
    store.customProducts[resolvedId] = productDto;
  }
  writePosStore(store);

  return { success: true, product: productDto };
}

/**
 * Soft-hide/delete a custom menu product (never hard-deletes canonical static catalog items).
 */
export async function deleteMenuProduct(
  productId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (productId || '').trim();
  if (!cleanId) {
    return { success: false, error: 'Thiếu mã sản phẩm cần ẩn/xóa.' };
  }

  const isCanonical = allMenuItems.some((m) => m.id === cleanId);
  if (isCanonical) {
    await setProductAvailability(cleanId, false);
    return { success: true };
  }

  const store = readPosStore();
  if (store.customProducts[cleanId]) {
    store.customProducts[cleanId].deleted = true;
    store.customProducts[cleanId].isAvailable = false;
  } else {
    store.customProducts[cleanId] = {
      id: cleanId,
      name: cleanId,
      category: 'Matcha',
      categorySlug: 'matcha',
      sizes: [{ label: 'M', price: 40000 }],
      isAvailable: false,
      deleted: true,
    };
  }
  store.availability[cleanId] = false;
  globalProductAvailability.set(cleanId, false);
  writePosStore(store);

  try {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(cleanId)) {
      const adminClient = createAdminClient();
      await adminClient
        .from('menu_items')
        .update({ is_available: false, updated_at: new Date().toISOString() })
        .eq('id', cleanId);
    }
  } catch (err) {
    console.warn('deleteMenuProduct DB fallback:', err);
  }

  return { success: true };
}

/**
 * Resolve active location metadata (address, phone, receiptFooter from Module D)
 * and current cash drawer shift status (from Module B) for POS counter display & receipts.
 */
export async function getPosLocationAndShiftContext(
  staff: PosStaffContext
): Promise<PosLocationContextInfo> {
  let address: string | undefined;
  let phone: string | undefined;
  let receiptFooter: string | undefined;
  let locationName = staff.locationName;

  try {
    const rbacProfile = buildUserRbacProfile({
      userId: staff.id,
      fullName: staff.fullName,
      email: staff.email,
      phone: staff.phone,
      businessId: staff.businessId,
      role: staff.staffRole,
      assignedLocationIds: [staff.locationId],
    });
    const [locs, bizProfile] = await Promise.all([
      listLocationsForUser(rbacProfile),
      getBusinessProfile(rbacProfile),
    ]);
    const matched = locs.find((l) => l.id === staff.locationId);
    if (matched) {
      locationName = matched.name || locationName;
      address = matched.address || undefined;
      phone = matched.phone || undefined;
      receiptFooter = matched.receiptFooter || bizProfile?.defaultReceiptFooter || undefined;
    } else if (bizProfile) {
      phone = bizProfile.phone || undefined;
      receiptFooter = bizProfile.defaultReceiptFooter || undefined;
    }
  } catch {
    // Fallback to staff context defaults
  }

  let activeShiftInfo: PosLocationContextInfo['activeShift'] = { isOpen: false };
  try {
    const activeShift = await getActiveShiftSession(staff.locationId);
    if (activeShift && activeShift.status === 'OPEN') {
      activeShiftInfo = {
        isOpen: true,
        shiftId: activeShift.id,
        shiftCode: activeShift.code,
        shiftName: activeShift.shiftName,
        openedAt: activeShift.openedAt,
        openedByName: activeShift.openedByName,
      };
    }
  } catch {
    // Keep default closed status
  }

  return {
    location: {
      locationId: staff.locationId,
      locationName,
      address,
      phone,
      receiptFooter,
    },
    activeShift: activeShiftInfo,
  };
}

function applyCatalogItemOverrides(item: MenuItem, store: PersistedPosStore): MenuItem | null {
  if (store.customProducts[item.id]?.deleted) {
    return null;
  }

  const metaOverride = store.productMetaOverrides[item.id];
  const overrideSizes = store.priceOverrides[item.id];
  const priceMap = globalProductPriceOverrides.get(item.id);
  const finalSizes =
    Array.isArray(overrideSizes) && overrideSizes.length > 0
      ? overrideSizes
      : priceMap
      ? item.sizes.map((s) => ({
          label: s.label,
          price: priceMap.get(s.label) ?? s.price,
        }))
      : item.sizes;

  const isAvailable = globalProductAvailability.has(item.id)
    ? globalProductAvailability.get(item.id)!
    : item.isAvailable !== false;

  const nextIsSignature = metaOverride?.isSignature ?? item.isSignature;
  const nextBadgeLabel = metaOverride
    ? nextIsSignature
      ? metaOverride.badgeLabel || 'Signature'
      : item.badgeLabel === 'Signature'
      ? undefined
      : item.badgeLabel
    : item.badgeLabel;

  return {
    ...item,
    name: metaOverride?.name || item.name,
    description: metaOverride?.description ?? item.description,
    shelfLife: metaOverride?.shelfLife ?? item.shelfLife,
    isSignature: nextIsSignature,
    badgeLabel: nextBadgeLabel,
    sizes: finalSizes,
    isAvailable,
  };
}

function appendCustomProductsForCategory(
  catSlug: string,
  catItems: MenuItem[],
  store: PersistedPosStore
): void {
  const customList = Object.values(store.customProducts).filter(
    (cp) => cp.categorySlug === catSlug && !cp.deleted
  );
  for (const cp of customList) {
    const alreadyPresent = catItems.some(
      (ci) => ci.id === cp.id || ci.name.toLowerCase() === cp.name.toLowerCase()
    );
    if (!alreadyPresent) {
      const resolved = applyCatalogItemOverrides(
        {
          id: cp.id,
          name: cp.name,
          description: cp.description,
          category: cp.category,
          categorySlug: cp.categorySlug,
          shelfLife: cp.shelfLife,
          isSignature: cp.isSignature,
          badgeLabel: cp.badgeLabel,
          sizes: cp.sizes,
          isAvailable: cp.isAvailable,
        },
        store
      );
      if (resolved) {
        catItems.push(resolved);
      }
    }
  }
}

/**
 * Fetch POS menu categories, items, sizes, and customization options.
 */
export async function getPosMenuCatalog() {
  const store = syncMemoryCachesFromStore();
  const adminClient = createAdminClient();

  try {
    const { data: dbCategories } = await adminClient
      .from('menu_categories')
      .select('id, name, slug, sort_order')
      .order('sort_order', { ascending: true });

    const { data: dbItems } = await adminClient
      .from('menu_items')
      .select('id, category_id, name, description, is_available, is_signature, sort_order, sizes:menu_item_sizes(id, size_label, price, is_available, sort_order)')
      .order('sort_order', { ascending: true });

    if (dbCategories && dbCategories.length > 0 && dbItems && dbItems.length > 0) {
      const validDbCategories = dbCategories.filter(
        (cat) => cat.slug !== 'cold-brew-dong-lon'
      );
      const categories: MenuCategory[] = validDbCategories.map((cat) => {
        const staticCat = menuData.find((c) => c.slug === cat.slug);
        const catItems: MenuItem[] = dbItems
          .filter((item) => {
            if (item.category_id !== cat.id) return false;
            if (store.customProducts[item.id]?.deleted) return false;
            const lower = item.name.trim().toLowerCase();
            // Exclude standalone Matcha Oat (now a free milk choice)
            if (lower === 'matcha oat') {
              return false;
            }
            return true;
          })
          .map((item) => {
            const lowerDbName = item.name.trim().toLowerCase();
            const isStrawberryMatcha =
              lowerDbName === 'strawberry matcha' || lowerDbName === 'strawberry matcha latte';
            const isMatchaKemBeo =
              lowerDbName === 'matcha kem béo' ||
              lowerDbName === 'matcha kem beo' ||
              lowerDbName === 'matcha kem muối' ||
              lowerDbName === 'matcha kem muoi';
            const staticMatch =
              staticCat?.items.find(
                (m) =>
                  m.name.toLowerCase() === lowerDbName ||
                  store.productMetaOverrides[m.id]?.name?.toLowerCase() === lowerDbName ||
                  (isStrawberryMatcha && m.id === 'strawberry-matcha') ||
                  (isMatchaKemBeo && m.id === 'matcha-kem-beo')
              ) ||
              allMenuItems.find(
                (m) =>
                  (m.name.toLowerCase() === lowerDbName ||
                    store.productMetaOverrides[m.id]?.name?.toLowerCase() === lowerDbName) &&
                  m.categorySlug === cat.slug
              ) ||
              allMenuItems.find((m) => m.id === item.id);
            const pid = staticMatch?.id || item.id;
            const rawSizes = Array.isArray(item.sizes) ? (item.sizes as DbSizeRow[]) : [];
            const sortedSizes = rawSizes
              .filter((s) => {
                if (s.is_available === false) return false;
                if (staticMatch && !staticMatch.sizes.some((st) => st.label === s.size_label)) {
                  return false;
                }
                return true;
              })
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((s) => ({
                label: s.size_label,
                price: Number(s.price) || 0,
              }));

            const baseItem: MenuItem = {
              id: pid,
              name: staticMatch?.name || item.name,
              description: staticMatch?.description || item.description || undefined,
              category: cat.name,
              categorySlug: cat.slug,
              imageUrl: staticMatch?.imageUrl,
              isSignature: Boolean(item.is_signature ?? staticMatch?.isSignature),
              badgeLabel: staticMatch?.badgeLabel,
              hasMilkChoice: staticMatch?.hasMilkChoice,
              shelfLife: staticMatch?.shelfLife,
              tag: staticMatch?.tag,
              sizes:
                staticMatch?.sizes ||
                (sortedSizes.length > 0 ? sortedSizes : [{ label: 'M', price: 30000 }]),
              isAvailable: item.is_available !== false,
            };
            return applyCatalogItemOverrides(baseItem, store);
          })
          .filter((item): item is MenuItem => item !== null);

        // Merge any canonical items from static menuData that haven't been seeded into DB yet
        if (staticCat) {
          for (const stItem of staticCat.items) {
            const overrideName = store.productMetaOverrides[stItem.id]?.name?.toLowerCase();
            const alreadyPresent = catItems.some(
              (ci) =>
                ci.id === stItem.id ||
                ci.name.toLowerCase() === stItem.name.toLowerCase() ||
                (overrideName ? ci.name.toLowerCase() === overrideName : false)
            );
            if (!alreadyPresent) {
              const resolved = applyCatalogItemOverrides(
                { ...stItem, isAvailable: true },
                store
              );
              if (resolved) {
                catItems.push(resolved);
              }
            }
          }
          // Sort catItems to match canonical menu order first, then any custom DB items
          const orderIndex = new Map(staticCat.items.map((it, idx) => [it.id, idx]));
          catItems.sort((a, b) => {
            const ia = orderIndex.has(a.id) ? orderIndex.get(a.id)! : 999;
            const ib = orderIndex.has(b.id) ? orderIndex.get(b.id)! : 999;
            return ia - ib;
          });
        }

        appendCustomProductsForCategory(cat.slug, catItems, store);

        return {
          name: cat.name,
          slug: cat.slug,
          icon: staticCat?.icon || '☕',
          subtitle: staticCat?.subtitle,
          items: catItems,
        };
      });

      return {
        categories,
        optionsConfig: {
          sweetness: SWEETNESS_OPTIONS,
          ice: ICE_OPTIONS,
          addons: ADDON_OPTIONS,
        },
      };
    }
  } catch (err) {
    console.warn('POS menu DB fetch fallback to static catalog:', err);
  }

  const mappedCategories: MenuCategory[] = menuData.map((cat) => {
    const catItems = cat.items
      .map((item) => applyCatalogItemOverrides({ ...item, isAvailable: true }, store))
      .filter((item): item is MenuItem => item !== null);
    appendCustomProductsForCategory(cat.slug, catItems, store);
    return {
      ...cat,
      items: catItems,
    };
  });

  return {
    categories: mappedCategories,
    optionsConfig: {
      sweetness: SWEETNESS_OPTIONS,
      ice: ICE_OPTIONS,
      addons: ADDON_OPTIONS,
    },
  };
}

/**
 * Helper to encode item options inside `product_name` when `order_items.item_options` column is not yet migrated.
 */
function formatFallbackProductName(item: NormalizedPosOrderItem): string {
  const summary = formatItemOptionsSummary(item.options, item.itemNote);
  if (!summary) return item.productName;
  return `${item.productName} [${summary}]`;
}

/**
 * Parse product name & options from an `order_items` row.
 */
function parseOrderItemRow(row: Record<string, unknown>) {
  const rawName = String(row.product_name || 'Món nước');
  let productName = rawName;
  let optionsSummary = '';

  const itemOptions = row.item_options as { sweetness?: string; ice?: string; addons?: { id: string; name: string; price: number }[] } | undefined;
  const itemNote = typeof row.item_note === 'string' ? row.item_note : undefined;

  if (itemOptions && typeof itemOptions === 'object' && Object.keys(itemOptions).length > 0) {
    optionsSummary = formatItemOptionsSummary(itemOptions, itemNote);
  } else {
    const bracketStart = rawName.indexOf(' [');
    const bracketEnd = rawName.lastIndexOf(']');
    if (bracketStart !== -1 && bracketEnd > bracketStart) {
      productName = rawName.slice(0, bracketStart).trim();
      optionsSummary = rawName.slice(bracketStart + 2, bracketEnd).trim();
    }
  }

  return {
    id: typeof row.id === 'string' ? row.id : undefined,
    productName,
    sizeLabel: String(row.size || 'M'),
    quantity: Number(row.quantity) || 1,
    unitPrice: Number(row.unit_price) || 0,
    subtotal: Number(row.subtotal) || (Number(row.unit_price) || 0) * (Number(row.quantity) || 1),
    optionsSummary,
    options: itemOptions,
    itemNote,
  };
}

/**
 * Persist order audit log into both `.data/pos-store.json` and Supabase `order_audit_logs` (best-effort).
 */
export async function recordOrderAuditLog(params: {
  businessId: string;
  locationId: string;
  orderId: string;
  orderCode: string;
  action: string;
  actorId?: string | null;
  actorName: string;
  actorRole: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const store = readPosStore();
  const entry: OrderAuditLogItem = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    orderId: params.orderId,
    orderCode: params.orderCode,
    action: params.action,
    actorName: params.actorName,
    actorRole: params.actorRole,
    reason: params.reason ?? null,
    metadata: params.metadata || {},
    createdAt: nowIso,
  };
  const existingLogs = store.auditLogs[params.orderId] || [];
  store.auditLogs[params.orderId] = [entry, ...existingLogs].slice(0, 50);
  writePosStore(store);

  try {
    const adminClient = createAdminClient();
    await adminClient.from('order_audit_logs').insert({
      business_id: params.businessId,
      location_id: params.locationId,
      order_id: params.orderId,
      order_code: params.orderCode,
      action: params.action,
      actor_id: params.actorId || null,
      actor_name: params.actorName,
      actor_role: params.actorRole,
      reason: params.reason ?? null,
      metadata: params.metadata || {},
    });
  } catch {
    // Ignore if order_audit_logs table is not yet migrated
  }
}

/**
 * Fetch order audit trail combining Supabase `order_audit_logs` and `.data/pos-store.json`.
 */
export async function getOrderAuditLogs(orderId: string): Promise<OrderAuditLogItem[]> {
  const storeLogs = readPosStore().auditLogs[orderId] || [];
  try {
    const adminClient = createAdminClient();
    const { data: rows, error } = await adminClient
      .from('order_audit_logs')
      .select('id, order_id, order_code, action, actor_name, actor_role, reason, metadata, created_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(rows) && rows.length > 0) {
      const dbLogs: OrderAuditLogItem[] = rows.map((r) => ({
        id: String(r.id || ''),
        orderId: String(r.order_id || orderId),
        orderCode: String(r.order_code || ''),
        action: String(r.action || ''),
        actorName: String(r.actor_name || 'Hệ thống'),
        actorRole: String(r.actor_role || 'STAFF'),
        reason: typeof r.reason === 'string' ? r.reason : null,
        metadata: (r.metadata as Record<string, unknown> | null) || {},
        createdAt: typeof r.created_at === 'string' ? r.created_at : new Date().toISOString(),
      }));
      const seenKeys = new Set(dbLogs.map((l) => `${l.action}:${l.createdAt.slice(0, 19)}`));
      const merged = [...dbLogs];
      for (const s of storeLogs) {
        const key = `${s.action}:${s.createdAt.slice(0, 19)}`;
        if (!seenKeys.has(key)) {
          merged.push(s);
        }
      }
      return merged.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
  } catch {
    // Fallback to store logs
  }
  return [...storeLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/**
 * Map a raw DB order row to `PosOrderRecord`.
 */
function mapOrderRowToPosRecord(row: Record<string, unknown>, qrTokenCode?: string): PosOrderRecord {
  const meta = extractPosOrderMetadata(row);
  const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
  const orderId = String(row.id || '');
  const status = (row.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED') || 'CONFIRMED';
  const persisted = readPosStore().orderFulfillment[orderId];

  const fulfillmentStatus: FulfillmentStatus =
    status === 'CANCELLED'
      ? 'CANCELLED'
      : persisted?.fulfillmentStatus ||
        meta.fulfillmentStatus ||
        normalizeFulfillmentStatus(null, status, meta.channel);

  const shippingFee = persisted?.shippingFee ?? meta.shippingFee ?? 0;

  return {
    id: orderId,
    orderCode: String(row.order_code || ''),
    status,
    fulfillmentStatus,
    channel: meta.channel,
    orderType: meta.orderType,
    paymentMethod: meta.paymentMethod,
    paymentStatus: meta.paymentStatus,
    subtotal: Number(row.subtotal) || 0,
    discountAmount: meta.discountAmount,
    discountPercent: meta.discountPercent,
    discountReason: meta.discountReason,
    pointsUsed: Number(row.points_used) || 0,
    shippingFee,
    customerAddress: meta.customerAddress,
    linkedOrderId: meta.linkedOrderId,
    linkedOrderCode: meta.linkedOrderCode,
    totalDue: Number(row.total_due) || 0,
    amountReceived: meta.amountReceived,
    changeDue: meta.changeDue,
    customerName: meta.customerName || 'Khách lẻ tại quầy',
    customerPhone: meta.customerPhone || '',
    cashierName: meta.cashierName || 'Thu ngân Ủ LAB',
    locationId: typeof row.location_id === 'string' ? row.location_id : undefined,
    note: meta.userNote || '',
    cancelReason: meta.cancelReason,
    cancelledBy: meta.cancelledBy,
    qrTokenCode,
    pointsEarned: meta.pointsEarned,
    memberPointBalance: meta.memberPointBalance,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    confirmedAt: typeof row.confirmed_at === 'string' ? row.confirmed_at : null,
    cancelledAt: typeof row.cancelled_at === 'string' ? row.cancelled_at : null,
    items: rawItems.map(parseOrderItemRow),
  };
}

/**
 * Resolve a fallback `user_id` in case the database still enforces `orders.user_id NOT NULL` for walk-in guests.
 */
async function resolveFallbackUserId(adminClient: ReturnType<typeof createAdminClient>, staff: PosStaffContext): Promise<string | null> {
  if (staff.dbUserId) return staff.dbUserId;

  const { data: anyAdmin } = await adminClient
    .from('users')
    .select('id')
    .eq('role', 'ADMIN')
    .limit(1)
    .maybeSingle();

  if (anyAdmin?.id) return anyAdmin.id;

  const { data: anyUser } = await adminClient
    .from('users')
    .select('id')
    .limit(1)
    .maybeSingle();

  return anyUser?.id || null;
}

/**
 * Create a paid POS order at the counter.
 */
export async function createPosOrder(
  payload: CreatePosOrderPayload,
  staff: PosStaffContext
): Promise<{ success: boolean; error?: string; order?: PosOrderRecord }> {
  const adminClient = createAdminClient();

  // 1. Check idempotency key to prevent duplicate orders
  const idempotencyKey = payload.idempotencyKey?.trim();
  if (idempotencyKey && recentIdempotencyCache.has(idempotencyKey)) {
    return {
      success: true,
      order: recentIdempotencyCache.get(idempotencyKey)!,
    };
  }

  // 2. Look up member profile by phone if provided (or auto-create member if valid phone)
  let memberProfile: {
    id: string;
    full_name: string | null;
    phone: string | null;
    point_balance: number;
    total_spending?: number;
    current_tier_id?: string;
    upgraded_to_silver?: boolean;
    upgraded_to_gold?: boolean;
    upgraded_to_diamond?: boolean;
    tier?: { id: string; code: string; name: string; cashback_rate: number } | null;
  } | null = null;
  const cleanPhone = (payload.customerPhone || '').replace(/[\s\-()]/g, '');
  if (cleanPhone) {
    const { data: byPhone } = await adminClient
      .from('users')
      .select('id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond, tier:tiers(id, code, name, cashback_rate)')
      .eq('phone', cleanPhone)
      .maybeSingle();

    if (byPhone) {
      const rawTier = Array.isArray(byPhone.tier) ? byPhone.tier[0] : byPhone.tier;
      memberProfile = {
        ...byPhone,
        tier: (rawTier as { id: string; code: string; name: string; cashback_rate: number } | null) || null,
      };
    } else if (/^0\d{8,10}$/.test(cleanPhone)) {
      // Auto-register member when cashier enters a valid new phone number at POS
      const { data: memberTier } = await adminClient
        .from('tiers')
        .select('id, code, name, cashback_rate')
        .eq('code', 'MEMBER')
        .maybeSingle();

      if (memberTier) {
        const autoName = payload.customerName?.trim() || `Thành viên ${cleanPhone.slice(-4)}`;
        const { data: createdMember } = await adminClient
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
          .select('id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond')
          .maybeSingle();

        if (createdMember) {
          memberProfile = {
            ...createdMember,
            tier: {
              id: memberTier.id,
              code: memberTier.code,
              name: memberTier.name,
              cashback_rate: Number(memberTier.cashback_rate) || 3,
            },
          };
        }
      }
    }
  }

  // 3. Calculate and validate order totals, discounts, points, and payment
  const { categories } = await getPosMenuCatalog();
  const dynamicCatalog = categories.flatMap((c) => c.items);

  const calc = calculatePosOrderTotals({
    items: payload.items,
    discount: payload.discount,
    pointsRequested: payload.pointsUsed || 0,
    availableMemberPoints: memberProfile?.point_balance || 0,
    paymentMethod: payload.paymentMethod || 'CASH',
    amountReceived: payload.amountReceived,
    staffRole: staff.staffRole,
    catalog: dynamicCatalog,
  });

  if (!calc.validation.valid) {
    return {
      success: false,
      error: calc.validation.error || 'Dữ liệu đơn hàng không hợp lệ.',
    };
  }

  const { totals } = calc;

  const shippingCheck = validateShippingFeeInput(payload.shippingFee);
  if (!shippingCheck.valid) {
    return {
      success: false,
      error: shippingCheck.error || 'Phí giao hàng không hợp lệ.',
    };
  }
  const shippingFee = shippingCheck.shippingFee;

  const finalTotalDue = totals.totalDue + shippingFee;
  const rawReceivedWithShip =
    (payload.paymentMethod || 'CASH') === 'CASH'
      ? payload.amountReceived !== undefined && payload.amountReceived > 0
        ? Math.floor(payload.amountReceived)
        : finalTotalDue
      : finalTotalDue;

  if ((payload.paymentMethod || 'CASH') === 'CASH' && rawReceivedWithShip < finalTotalDue) {
    return {
      success: false,
      error: `Số tiền khách đưa (${rawReceivedWithShip.toLocaleString('vi-VN')}đ) nhỏ hơn tổng cần thu (${finalTotalDue.toLocaleString('vi-VN')}đ).`,
    };
  }
  const finalChangeDue = Math.max(0, rawReceivedWithShip - finalTotalDue);

  // 4. Generate unique POS Order Code (POS-YYMMDD-XXXX)
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { count: todayCount } = await adminClient
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', startOfDay);

  let orderCode = generatePosOrderCode(now, (todayCount || 0) + 1);

  // Verify uniqueness of orderCode
  const { data: existingCode } = await adminClient
    .from('orders')
    .select('id')
    .eq('order_code', orderCode)
    .maybeSingle();

  if (existingCode) {
    orderCode = generatePosOrderCode(now);
  }

  const customerName =
    payload.customerName?.trim() ||
    memberProfile?.full_name ||
    (cleanPhone ? `Khách (${cleanPhone})` : 'Khách lẻ tại quầy');

  const cleanAddress = payload.customerAddress?.trim() || undefined;
  const linkedOrderId = payload.linkedOrderId?.trim() || undefined;
  const linkedOrderCode = payload.linkedOrderCode?.trim() || undefined;

  const fallbackNote = serializePosFallbackNote({
    channel: 'POS',
    orderType: payload.orderType || 'TAKEAWAY',
    paymentMethod: payload.paymentMethod || 'CASH',
    paymentStatus: 'PAID',
    fulfillmentStatus: 'COMPLETED',
    shippingFee,
    customerAddress: cleanAddress,
    linkedOrderId,
    linkedOrderCode,
    discountAmount: totals.discountAmount,
    discountPercent: totals.discountPercent,
    discountReason: payload.discount?.reason?.trim() || undefined,
    amountReceived: rawReceivedWithShip,
    changeDue: finalChangeDue,
    customerName,
    customerPhone: cleanPhone,
    cashierName: staff.fullName,
    userNote: payload.note?.trim() || '',
  });

  // 5. Try inserting with V2 (0013) -> M01 (0001) -> base schema fallback
  let insertedOrder: Record<string, unknown> | null = null;

  const m01InsertPayload: Record<string, unknown> = {
    order_code: orderCode,
    user_id: memberProfile?.id || null,
    business_id: staff.businessId,
    location_id: staff.locationId,
    channel: 'POS',
    order_type: payload.orderType || 'TAKEAWAY',
    customer_name: customerName,
    customer_phone: cleanPhone || null,
    status: 'CONFIRMED',
    subtotal: totals.subtotal,
    discount_amount: totals.discountAmount,
    discount_percent: totals.discountPercent,
    discount_reason: payload.discount?.reason?.trim() || null,
    discount_approved_by: totals.discountAmount > 0 ? staff.dbUserId : null,
    points_used: totals.pointsUsed,
    total_due: finalTotalDue,
    payment_method: payload.paymentMethod || 'CASH',
    payment_status: 'PAID',
    amount_received: rawReceivedWithShip,
    change_due: finalChangeDue,
    idempotency_key: idempotencyKey || null,
    created_by: staff.dbUserId,
    confirmed_at: now.toISOString(),
    note: fallbackNote,
  };

  const v2InsertPayload: Record<string, unknown> = {
    ...m01InsertPayload,
    fulfillment_status: 'COMPLETED',
    shipping_fee: shippingFee,
    customer_address: cleanAddress || null,
    linked_order_id: linkedOrderId || null,
    prepared_at: now.toISOString(),
    completed_at: now.toISOString(),
  };

  const { data: v2Inserted, error: v2Error } = await adminClient
    .from('orders')
    .insert(v2InsertPayload)
    .select('*')
    .single();

  if (!v2Error && v2Inserted) {
    insertedOrder = v2Inserted as Record<string, unknown>;
  } else {
    const { data: m01Inserted, error: m01Error } = await adminClient
      .from('orders')
      .insert(m01InsertPayload)
      .select('*')
      .single();

    if (!m01Error && m01Inserted) {
      insertedOrder = m01Inserted as Record<string, unknown>;
    } else {
      // Fallback for unmigrated schema (e.g. missing columns or user_id NOT NULL constraint)
      const fallbackUserId = memberProfile?.id || (await resolveFallbackUserId(adminClient, staff));
      const baseInsertPayload: Record<string, unknown> = {
        order_code: orderCode,
        user_id: fallbackUserId,
        status: 'CONFIRMED',
        subtotal: totals.subtotal,
        points_used: totals.pointsUsed,
        total_due: finalTotalDue,
        confirmed_at: now.toISOString(),
        note: fallbackNote,
      };

      const { data: baseInserted, error: baseError } = await adminClient
        .from('orders')
        .insert(baseInsertPayload)
        .select('*')
        .single();

      if (baseError || !baseInserted) {
        console.error('POS Order creation failed:', { v2Error, m01Error, baseError });
        return {
          success: false,
          error: baseError?.message || 'Không thể lưu đơn hàng vào cơ sở dữ liệu.',
        };
      }
      insertedOrder = baseInserted as Record<string, unknown>;
    }
  }

  // 6. Insert order items (try extended columns first, fallback to base columns)
  const fullItemsPayload = totals.items.map((it) => ({
    order_id: String(insertedOrder!.id),
    business_id: staff.businessId,
    location_id: staff.locationId,
    product_name: formatFallbackProductName(it),
    size: it.sizeLabel,
    quantity: it.quantity,
    unit_price: it.unitPrice,
    subtotal: it.subtotal,
    item_options: it.options,
    item_note: it.itemNote || null,
  }));

  let insertedItems: Record<string, unknown>[] | null = null;
  const { data: extItems, error: extItemsErr } = await adminClient
    .from('order_items')
    .insert(fullItemsPayload)
    .select('*');

  if (!extItemsErr && extItems) {
    insertedItems = extItems as Record<string, unknown>[];
  } else {
    const baseItemsPayload = totals.items.map((it) => ({
      order_id: String(insertedOrder!.id),
      product_name: formatFallbackProductName(it),
      size: it.sizeLabel,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      subtotal: it.subtotal,
    }));
    const { data: fallbackItems } = await adminClient
      .from('order_items')
      .insert(baseItemsPayload)
      .select('*');
    insertedItems = (fallbackItems as Record<string, unknown>[] | null) || (baseItemsPayload as Record<string, unknown>[]);
  }

  // 7. Deduct member points if used & Automatically credit cashback points when member phone is provided
  let pointsEarned = 0;
  let finalMemberBalance = memberProfile ? Number(memberProfile.point_balance) || 0 : undefined;

  if (memberProfile && totals.pointsUsed > 0) {
    finalMemberBalance = Math.max(0, (finalMemberBalance || 0) - totals.pointsUsed);
    const updatedSpending = (Number(memberProfile.total_spending) || 0) + totals.totalDue;
    await adminClient
      .from('users')
      .update({
        point_balance: finalMemberBalance,
        total_spending: updatedSpending,
        updated_at: now.toISOString(),
      })
      .eq('id', memberProfile.id);

    await adminClient.from('point_transactions').insert({
      user_id: memberProfile.id,
      type: 'ORDER_DEDUCT',
      amount: -totals.pointsUsed,
      balance_after: finalMemberBalance,
      reference_id: String(insertedOrder!.order_code),
      description: `Trừ điểm tại quầy POS cho đơn ${insertedOrder!.order_code} (Đơn trừ tiền không tích điểm mới)`,
    });
  }

  // 7b. Auto-credit cashback points directly to customer wallet when phone is entered at POS
  // Rule: Orders that redeem points/balance from the account (totals.pointsUsed > 0) do NOT earn cashback!
  if (memberProfile && totals.totalDue > 0 && totals.pointsUsed === 0) {
    const tierRate = resolveTierCashbackRate(
      memberProfile.tier?.code,
      Number(memberProfile.tier?.cashback_rate)
    );
    const cashbackEarned = Math.floor((totals.totalDue * tierRate) / 100);
    const newSpending = (Number(memberProfile.total_spending) || 0) + totals.totalDue;
    let newBalance = (finalMemberBalance || 0) + cashbackEarned;

    let newTierId = memberProfile.current_tier_id;
    let newTierName = memberProfile.tier?.name || 'Member';
    let tierBonus = 0;
    const tierFlagUpdates: Record<string, boolean> = {};

    const { data: allTiers } = await adminClient
      .from('tiers')
      .select('id, code, name, min_spending')
      .order('min_spending', { ascending: false });

    if (allTiers && allTiers.length > 0) {
      for (const t of allTiers) {
        if (newSpending >= Number(t.min_spending)) {
          if (t.id !== memberProfile.current_tier_id) {
            newTierId = t.id;
            newTierName = t.name;
            if (t.code === 'SILVER' && !memberProfile.upgraded_to_silver) {
              tierBonus = 100000;
              tierFlagUpdates.upgraded_to_silver = true;
            } else if (t.code === 'GOLD' && !memberProfile.upgraded_to_gold) {
              tierBonus = 200000;
              tierFlagUpdates.upgraded_to_gold = true;
            } else if (t.code === 'DIAMOND' && !memberProfile.upgraded_to_diamond) {
              tierBonus = 45000;
              tierFlagUpdates.upgraded_to_diamond = true;
            }
            newBalance += tierBonus;
          }
          break;
        }
      }
    }

    if (cashbackEarned > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: memberProfile.id,
        type: 'CASHBACK',
        amount: cashbackEarned,
        balance_after: newBalance - tierBonus,
        reference_id: String(insertedOrder!.order_code),
        description: `Tích điểm tại quầy (${tierRate}% hạng ${memberProfile.tier?.name || 'Member'}) qua SĐT cho đơn ${insertedOrder!.order_code}`,
      });
    }

    if (tierBonus > 0) {
      await adminClient.from('point_transactions').insert({
        user_id: memberProfile.id,
        type: 'TIER_UP_BONUS',
        amount: tierBonus,
        balance_after: newBalance,
        reference_id: newTierName,
        description: `Thưởng thăng hạng ${newTierName} ✨`,
      });
    }

    await adminClient
      .from('users')
      .update({
        point_balance: newBalance,
        total_spending: newSpending,
        ...(newTierId ? { current_tier_id: newTierId } : {}),
        ...tierFlagUpdates,
        updated_at: now.toISOString(),
      })
      .eq('id', memberProfile.id);

    pointsEarned = cashbackEarned + tierBonus;
    finalMemberBalance = newBalance;
  }

  // 8. QR Sticker generation retired — Phone-based loyalty is now handled directly above.
  const qrTokenCode: string | undefined = undefined;

  // 8b. Persist fulfillment status in resilient store & complete linked Web order if applicable
  const createdOrderId = String(insertedOrder!.id);
  const storeAfterCreate = readPosStore();
  storeAfterCreate.orderFulfillment[createdOrderId] = {
    fulfillmentStatus: 'COMPLETED',
    shippingFee,
    updatedAt: now.toISOString(),
  };

  if (linkedOrderId) {
    try {
      const { data: linkedRow } = await adminClient
        .from('orders')
        .select('*')
        .eq('id', linkedOrderId)
        .maybeSingle();

      if (linkedRow) {
        const linkedObj = linkedRow as Record<string, unknown>;
        const linkedMeta = extractPosOrderMetadata(linkedObj);
        const linkedHuman = [
          linkedMeta.userNote,
          `[Đã thu tiền & xuất bill tại POS #${orderCode}]`,
        ]
          .filter(Boolean)
          .join(' ')
          .trim();
        const linkedUpdatedNote = serializePosFallbackNote({
          ...linkedMeta,
          paymentStatus: 'PAID',
          fulfillmentStatus: 'COMPLETED',
          linkedOrderId: createdOrderId,
          linkedOrderCode: orderCode,
          userNote: linkedHuman,
        });

        const { error: linkV2Err } = await adminClient
          .from('orders')
          .update({
            status: 'CONFIRMED',
            payment_status: 'PAID',
            fulfillment_status: 'COMPLETED',
            linked_order_id: createdOrderId,
            confirmed_at: linkedObj.confirmed_at || now.toISOString(),
            completed_at: now.toISOString(),
            note: linkedUpdatedNote,
            updated_at: now.toISOString(),
          })
          .eq('id', linkedOrderId);

        if (linkV2Err) {
          await adminClient
            .from('orders')
            .update({
              status: 'CONFIRMED',
              confirmed_at: linkedObj.confirmed_at || now.toISOString(),
              note: linkedUpdatedNote,
              updated_at: now.toISOString(),
            })
            .eq('id', linkedOrderId);
        }

        storeAfterCreate.orderFulfillment[linkedOrderId] = {
          fulfillmentStatus: 'COMPLETED',
          shippingFee: linkedMeta.shippingFee || 0,
          updatedAt: now.toISOString(),
        };

        writePosStore(storeAfterCreate);

        await recordOrderAuditLog({
          businessId: staff.businessId,
          locationId: staff.locationId,
          orderId: linkedOrderId,
          orderCode: String(linkedObj.order_code || linkedOrderCode || linkedOrderId),
          action: 'LINKED_TO_POS_ORDER',
          actorId: staff.dbUserId,
          actorName: staff.fullName,
          actorRole: staff.staffRole,
          reason: `Đã thu tiền & xuất hóa đơn tại POS (${orderCode})`,
          metadata: {
            posOrderId: createdOrderId,
            posOrderCode: orderCode,
          },
        });
      } else {
        writePosStore(storeAfterCreate);
      }
    } catch (linkErr) {
      console.warn('Linked Web order auto-complete warning:', linkErr);
      writePosStore(storeAfterCreate);
    }
  } else {
    writePosStore(storeAfterCreate);
  }

  // 9. Write audit log (best-effort + local store)
  await recordOrderAuditLog({
    businessId: staff.businessId,
    locationId: staff.locationId,
    orderId: createdOrderId,
    orderCode: String(insertedOrder!.order_code),
    action: totals.discountAmount > 0 ? 'CREATED_WITH_DISCOUNT' : 'CREATED_AND_PAID',
    actorId: staff.dbUserId,
    actorName: staff.fullName,
    actorRole: staff.staffRole,
    reason: payload.discount?.reason || null,
    metadata: {
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      pointsUsed: totals.pointsUsed,
      shippingFee,
      totalDue: finalTotalDue,
      paymentMethod: payload.paymentMethod,
      linkedOrderId,
      linkedOrderCode,
    },
  });

  // 10. Record payment in PAYMENTS table & Deduct Inventory via Recipe/FEFO/FIFO
  try {
    await adminClient.from('payments').insert({
      business_id: staff.businessId,
      location_id: staff.locationId,
      order_id: createdOrderId,
      payment_method: payload.paymentMethod || 'CASH',
      amount: finalTotalDue,
      status: 'COMPLETED',
      reference_code: String(insertedOrder!.order_code),
    });
  } catch {
    // Ignore if payments table is not yet migrated
  }

  try {
    await processPosOrderInventory(
      createdOrderId,
      staff.businessId,
      staff.locationId,
      totals.items,
      staff.dbUserId
    );
  } catch {
    // Fallback gracefully if inventory tables/recipes are still being initialized
  }

  const record = mapOrderRowToPosRecord(
    {
      ...insertedOrder,
      items: insertedItems || [],
    },
    qrTokenCode
  );
  record.shippingFee = shippingFee;
  if (pointsEarned > 0) {
    record.pointsEarned = pointsEarned;
  }
  if (finalMemberBalance !== undefined) {
    record.memberPointBalance = finalMemberBalance;
  }

  if (idempotencyKey) {
    recentIdempotencyCache.set(idempotencyKey, record);
  }

  return {
    success: true,
    order: record,
  };
}

/**
 * List recent orders for POS lookup and management (filtered by active location & fulfillment progress).
 */
export async function listPosOrders(params: {
  status?: string;
  fulfillmentStatus?: string;
  locationId?: string;
  search?: string;
  date?: string; // YYYY-MM-DD
  limit?: number;
}): Promise<{ orders: PosOrderRecord[]; total: number }> {
  const adminClient = createAdminClient();
  const limit = Math.min(Math.max(1, params.limit || 30), 100);
  const fetchLimit = Math.min(Math.max(limit * 3, 60), 300);

  const buildPosOrdersQuery = (selectStr: string) => {
    let q = adminClient
      .from('orders')
      .select(selectStr)
      .order('created_at', { ascending: false })
      .limit(fetchLimit);

    if (params.status && params.status !== 'ALL') {
      q = q.eq('status', params.status);
    }

    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      const dayStart = new Date(`${params.date}T00:00:00.000+07:00`).toISOString();
      const dayEnd = new Date(`${params.date}T23:59:59.999+07:00`).toISOString();
      q = q.gte('created_at', dayStart).lte('created_at', dayEnd);
    }

    if (params.search && params.search.trim()) {
      const clean = escapeFilterInput(params.search.trim());
      if (clean) {
        q = q.or(`order_code.ilike.%${clean}%,note.ilike.%${clean}%`);
      }
    }
    return q;
  };

  let { data: rows, error } = await buildPosOrdersQuery(
    '*, items:order_items(*), user:users!user_id(id, full_name, email, phone)'
  );

  if (error) {
    const fallback = await buildPosOrdersQuery('*, items:order_items(*)');
    rows = fallback.data;
    error = fallback.error;
  }

  if (error || !rows) {
    console.error('listPosOrders error:', error);
    return { orders: [], total: 0 };
  }

  const locationRows = (rows as unknown as Record<string, unknown>[]).filter((r) =>
    matchesOrderLocation(r.location_id, params.locationId)
  );

  let mapped = locationRows.map((r) => mapOrderRowToPosRecord(r));

  if (params.fulfillmentStatus && params.fulfillmentStatus !== 'ALL') {
    const targetFulfillment = params.fulfillmentStatus.trim().toUpperCase();
    mapped = mapped.filter((o) => o.fulfillmentStatus === targetFulfillment);
  }

  return {
    orders: mapped.slice(0, limit),
    total: mapped.length,
  };
}

/**
 * Update fulfillment progress (`PENDING` -> `PREPARING` -> `READY` -> `COMPLETED`) for any order.
 */
export async function updateOrderFulfillmentStatus(params: {
  orderId: string;
  fulfillmentStatus: FulfillmentStatus;
  staff: PosStaffContext;
}): Promise<{ success: boolean; error?: string; order?: PosOrderRecord }> {
  const adminClient = createAdminClient();
  const { data: existing, error: fetchErr } = await adminClient
    .from('orders')
    .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
    .eq('id', params.orderId)
    .maybeSingle();

  let existingRow = existing as Record<string, unknown> | null;
  if (fetchErr || !existingRow) {
    const fallback = await adminClient
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', params.orderId)
      .maybeSingle();
    existingRow = fallback.data as Record<string, unknown> | null;
  }

  if (!existingRow) {
    return { success: false, error: 'Không tìm thấy đơn hàng.' };
  }

  const currentRecord = mapOrderRowToPosRecord(existingRow);
  const check = validateFulfillmentTransition(
    currentRecord.fulfillmentStatus,
    params.fulfillmentStatus
  );
  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const nowIso = new Date().toISOString();
  const prevMeta = extractPosOrderMetadata(existingRow);
  const updatedNote = serializePosFallbackNote({
    ...prevMeta,
    fulfillmentStatus: params.fulfillmentStatus,
  });

  const v2Payload: Record<string, unknown> = {
    fulfillment_status: params.fulfillmentStatus,
    note: updatedNote,
    updated_at: nowIso,
  };
  if (params.fulfillmentStatus === 'READY' && !existingRow.prepared_at) {
    v2Payload.prepared_at = nowIso;
  }
  if (params.fulfillmentStatus === 'COMPLETED') {
    v2Payload.completed_at = nowIso;
  }

  let updatedRow: Record<string, unknown> | null = null;
  const { data: v2Updated, error: v2Err } = await adminClient
    .from('orders')
    .update(v2Payload)
    .eq('id', params.orderId)
    .select('*, items:order_items(*)')
    .maybeSingle();

  if (!v2Err && v2Updated) {
    updatedRow = v2Updated as Record<string, unknown>;
  } else {
    const { data: baseUpdated, error: baseErr } = await adminClient
      .from('orders')
      .update({
        note: updatedNote,
        updated_at: nowIso,
      })
      .eq('id', params.orderId)
      .select('*, items:order_items(*)')
      .maybeSingle();

    if (baseErr || !baseUpdated) {
      return { success: false, error: 'Không thể cập nhật tiến độ phục vụ đơn hàng.' };
    }
    updatedRow = baseUpdated as Record<string, unknown>;
  }

  const store = readPosStore();
  store.orderFulfillment[params.orderId] = {
    fulfillmentStatus: params.fulfillmentStatus,
    shippingFee: currentRecord.shippingFee,
    updatedAt: nowIso,
  };
  writePosStore(store);

  await recordOrderAuditLog({
    businessId: params.staff.businessId,
    locationId: params.staff.locationId,
    orderId: params.orderId,
    orderCode: String(existingRow.order_code || currentRecord.orderCode),
    action: `FULFILLMENT_${params.fulfillmentStatus}`,
    actorId: params.staff.dbUserId,
    actorName: params.staff.fullName,
    actorRole: params.staff.staffRole,
    reason: null,
    metadata: {
      previousFulfillmentStatus: currentRecord.fulfillmentStatus,
      nextFulfillmentStatus: params.fulfillmentStatus,
    },
  });

  return {
    success: true,
    order: mapOrderRowToPosRecord(updatedRow),
  };
}

/**
 * Soft-cancel a POS order according to role permissions, with audit log and automatic point refund.
 */
export async function cancelPosOrder(params: {
  orderId: string;
  cancelReason: string;
  staff: PosStaffContext;
}): Promise<{ success: boolean; error?: string; order?: PosOrderRecord }> {
  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from('orders')
    .select('*, items:order_items(*), user:users(id, full_name, email, phone, point_balance, locked_points)')
    .eq('id', params.orderId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return { success: false, error: 'Không tìm thấy đơn hàng cần hủy.' };
  }

  const existingRow = existing as Record<string, unknown>;
  const currentStatus = (existingRow.status as 'PENDING' | 'CONFIRMED' | 'CANCELLED') || 'CONFIRMED';

  const check = validatePosOrderCancel({
    currentStatus,
    staffRole: params.staff.staffRole,
    cancelReason: params.cancelReason,
  });

  if (!check.valid) {
    return { success: false, error: check.error };
  }

  const nowIso = new Date().toISOString();
  const prevMeta = extractPosOrderMetadata(existingRow);
  const updatedNote = serializePosFallbackNote({
    ...prevMeta,
    paymentStatus: 'REFUNDED',
    fulfillmentStatus: 'CANCELLED',
    cancelReason: params.cancelReason.trim(),
    cancelledBy: `${params.staff.fullName} (${params.staff.staffRole})`,
  });

  // Update order status to CANCELLED (try V2 -> M01 -> base columns)
  let updatedRow: Record<string, unknown> | null = null;
  const m01CancelPayload = {
    status: 'CANCELLED',
    payment_status: 'REFUNDED',
    cancelled_at: nowIso,
    cancelled_by: params.staff.dbUserId,
    cancel_reason: params.cancelReason.trim(),
    note: updatedNote,
    updated_at: nowIso,
  };

  const { data: v2Update, error: v2Err } = await adminClient
    .from('orders')
    .update({
      ...m01CancelPayload,
      fulfillment_status: 'CANCELLED',
    })
    .eq('id', params.orderId)
    .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
    .single();

  if (!v2Err && v2Update) {
    updatedRow = v2Update as Record<string, unknown>;
  } else {
    const { data: extUpdate, error: extErr } = await adminClient
      .from('orders')
      .update(m01CancelPayload)
      .eq('id', params.orderId)
      .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
      .single();

    if (!extErr && extUpdate) {
      updatedRow = extUpdate as Record<string, unknown>;
    } else {
      const { data: baseUpdate, error: baseErr } = await adminClient
        .from('orders')
        .update({
          status: 'CANCELLED',
          cancelled_at: nowIso,
          note: updatedNote,
          updated_at: nowIso,
        })
        .eq('id', params.orderId)
        .select('*, items:order_items(*), user:users(id, full_name, email, phone)')
        .single();

      if (baseErr || !baseUpdate) {
        return { success: false, error: 'Lỗi cập nhật trạng thái hủy đơn.' };
      }
      updatedRow = baseUpdate as Record<string, unknown>;
    }
  }

  const cancelStore = readPosStore();
  cancelStore.orderFulfillment[params.orderId] = {
    fulfillmentStatus: 'CANCELLED',
    shippingFee: prevMeta.shippingFee || 0,
    updatedAt: nowIso,
  };
  writePosStore(cancelStore);

  // Refund member points if points were used on this order, AND revoke earned cashback points if any were credited
  const pointsUsed = Number(existingRow.points_used) || 0;
  const orderCodeStr = String(existingRow.order_code);
  const orderTotalDue = Number(existingRow.total_due) || 0;

  // Expire any active QR token linked to this cancelled order so it cannot be scanned later
  if (prevMeta.qrTokenCode) {
    try {
      await adminClient
        .from('qr_tokens')
        .update({ status: 'EXPIRED' })
        .eq('code', prevMeta.qrTokenCode)
        .eq('status', 'ACTIVE');
    } catch {
      // Ignore if qr_tokens update fails
    }
  }

  // Look up any CASHBACK transactions earned from this order (via auto-phone POS credit or scanned QR token)
  const refCandidates = [orderCodeStr, ...(prevMeta.qrTokenCode ? [prevMeta.qrTokenCode] : [])];
  const { data: earnedTxs } = await adminClient
    .from('point_transactions')
    .select('id, user_id, type, amount, reference_id')
    .in('reference_id', refCandidates)
    .in('type', ['CASHBACK', 'ORDER_CONFIRM'])
    .gt('amount', 0);

  let revokedCashbackPoints = 0;

  // 1) Refund points that the customer spent on this order (if pointsUsed > 0)
  if (pointsUsed > 0) {
    let spendUserId = existingRow.user_id as string | undefined;
    if (!spendUserId && prevMeta.customerPhone) {
      const cleanCancelPhone = prevMeta.customerPhone.replace(/\s+/g, '');
      if (cleanCancelPhone) {
        const { data: byPhone } = await adminClient
          .from('users')
          .select('id')
          .eq('phone', cleanCancelPhone)
          .maybeSingle();
        if (byPhone?.id) spendUserId = String(byPhone.id);
      }
    }

    if (spendUserId) {
      const { data: spendUser } = await adminClient
        .from('users')
        .select('id, point_balance, locked_points')
        .eq('id', spendUserId)
        .maybeSingle();

      if (spendUser) {
        const refundedBalance = (Number(spendUser.point_balance) || 0) + pointsUsed;
        const newLocked =
          currentStatus === 'PENDING'
            ? Math.max(0, (Number(spendUser.locked_points) || 0) - pointsUsed)
            : Number(spendUser.locked_points) || 0;

        await adminClient
          .from('users')
          .update({
            point_balance: refundedBalance,
            locked_points: newLocked,
            updated_at: nowIso,
          })
          .eq('id', spendUser.id);

        await adminClient.from('point_transactions').insert({
          user_id: spendUser.id,
          type: 'ORDER_CANCEL_REFUND',
          amount: pointsUsed,
          balance_after: refundedBalance,
          reference_id: orderCodeStr,
          description: `Hoàn điểm đã dùng do hủy đơn ${orderCodeStr}: ${params.cancelReason.trim()}`,
        });
      }
    }
  }

  // 2) Revoke/claw back cashback points that the customer earned from this order
  if (earnedTxs && earnedTxs.length > 0) {
    const earnedByUser = new Map<string, number>();
    for (const tx of earnedTxs) {
      const uid = String(tx.user_id || '');
      const amt = Number(tx.amount) || 0;
      if (uid && amt > 0) {
        earnedByUser.set(uid, (earnedByUser.get(uid) || 0) + amt);
      }
    }

    for (const [uid, earnedAmount] of earnedByUser.entries()) {
      const { data: earnerRow } = await adminClient
        .from('users')
        .select('id, point_balance, total_spending')
        .eq('id', uid)
        .maybeSingle();

      if (earnerRow && earnedAmount > 0) {
        revokedCashbackPoints += earnedAmount;
        const newBalance = Math.max(0, (Number(earnerRow.point_balance) || 0) - earnedAmount);
        const newSpending = Math.max(0, (Number(earnerRow.total_spending) || 0) - orderTotalDue);

        await adminClient
          .from('users')
          .update({
            point_balance: newBalance,
            total_spending: newSpending,
            updated_at: nowIso,
          })
          .eq('id', earnerRow.id);

        await adminClient.from('point_transactions').insert({
          user_id: earnerRow.id,
          type: 'ORDER_CANCEL_REFUND',
          amount: -earnedAmount,
          balance_after: newBalance,
          reference_id: orderCodeStr,
          description: `Thu hồi điểm tích lũy (-${earnedAmount.toLocaleString('vi-VN')}đ) do hủy đơn ${orderCodeStr}: ${params.cancelReason.trim()}`,
        });
      }
    }
  }

  // Write audit log (best-effort + local store)
  await recordOrderAuditLog({
    businessId: params.staff.businessId,
    locationId: params.staff.locationId,
    orderId: String(existingRow.id),
    orderCode: String(existingRow.order_code),
    action: 'CANCELLED',
    actorId: params.staff.dbUserId,
    actorName: params.staff.fullName,
    actorRole: params.staff.staffRole,
    reason: params.cancelReason.trim(),
    metadata: {
      previousStatus: currentStatus,
      refundedPoints: pointsUsed,
      revokedCashbackPoints,
      totalDue: existingRow.total_due,
    },
  });

  // Reverse payment in PAYMENTS table & reverse inventory deductions back to original lot & layer
  try {
    await adminClient
      .from('payments')
      .update({ status: 'REFUNDED' })
      .eq('order_id', params.orderId);

    await reversePosOrderInventory(params.orderId, params.staff.businessId, params.staff.dbUserId);
  } catch {
    // Fallback gracefully if inventory reversal is not configured
  }

  return {
    success: true,
    order: mapOrderRowToPosRecord(updatedRow!),
  };
}

/**
 * Apply Phone-Based Loyalty when a Web/PENDING order is confirmed or marked paid by staff.
 * - Rule: If the order used wallet points (`points_used > 0`), it MUST NOT earn cashback (`pointsEarned = 0`).
 * - If `points_used === 0` and `eligibleAmount > 0`, credits tier % cashback (`3%`, `5%`, `7%`, `10%`) idempotently.
 */
export async function applyPhoneLoyaltyForConfirmedOrder(orderId: string): Promise<{
  pointsEarned: number;
  memberPointBalance?: number;
}> {
  const adminClient = createAdminClient();
  const { data: orderRow } = await adminClient
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (!orderRow) {
    return { pointsEarned: 0 };
  }

  const orderCode = String(orderRow.order_code || '');
  const pointsUsed = Number(orderRow.points_used) || 0;
  const totalDue = Number(orderRow.total_due) || 0;
  const rawNote = String(orderRow.note || '');

  // Extract shipping fee from column or note if present so cashback only applies to drink payment
  let shippingFee = Number((orderRow as Record<string, unknown>).shipping_fee) || 0;
  if (!shippingFee) {
    const shipMatch = rawNote.match(/\[Phí ship:\s*([\d.,]+)\s*đ?\]/i);
    if (shipMatch) {
      shippingFee = Number(shipMatch[1].replace(/\D/g, '')) || 0;
    }
  }
  const eligibleDrinkAmount = Math.max(0, totalDue - shippingFee);

  // Resolve member profile by user_id or phone number in order/note
  type MemberRow = {
    id: string;
    full_name: string | null;
    phone: string | null;
    point_balance: number;
    total_spending?: number;
    current_tier_id?: string;
    upgraded_to_silver?: boolean;
    upgraded_to_gold?: boolean;
    upgraded_to_diamond?: boolean;
    tier?: { id: string; code: string; name: string; cashback_rate: number } | null;
  };
  let member: MemberRow | null = null;

  if (orderRow.user_id) {
    const { data: byId } = await adminClient
      .from('users')
      .select(
        'id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond, tier:tiers(id, code, name, cashback_rate)'
      )
      .eq('id', orderRow.user_id)
      .maybeSingle();
    if (byId) {
      const rawTier = Array.isArray(byId.tier) ? byId.tier[0] : byId.tier;
      member = {
        ...byId,
        tier: (rawTier as { id: string; code: string; name: string; cashback_rate: number } | null) || null,
      };
    }
  }

  let extractedPhone = String((orderRow as Record<string, unknown>).customer_phone || '').replace(/\D/g, '');
  let extractedName = String((orderRow as Record<string, unknown>).customer_name || '').trim();
  if (!extractedPhone) {
    const khMatch = rawNote.match(/KH:\s*([^|(]+)(?:\(([^)]+)\))?/);
    if (khMatch) {
      if (!extractedName && khMatch[1]?.trim()) extractedName = khMatch[1].trim();
      if (khMatch[2]?.trim()) extractedPhone = khMatch[2].replace(/\D/g, '');
    }
  }

  // If user_id points to a staff/admin fallback account or wasn't linked, prefer matching customer phone if present
  if ((!member || (extractedPhone && member.phone !== extractedPhone)) && /^0\d{8,10}$/.test(extractedPhone)) {
    const { data: byPhone } = await adminClient
      .from('users')
      .select(
        'id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond, tier:tiers(id, code, name, cashback_rate)'
      )
      .eq('phone', extractedPhone)
      .maybeSingle();

    if (byPhone) {
      const rawTier = Array.isArray(byPhone.tier) ? byPhone.tier[0] : byPhone.tier;
      member = {
        ...byPhone,
        tier: (rawTier as { id: string; code: string; name: string; cashback_rate: number } | null) || null,
      };
    } else {
      const { data: memberTier } = await adminClient
        .from('tiers')
        .select('id, code, name, cashback_rate')
        .eq('code', 'MEMBER')
        .maybeSingle();
      if (memberTier) {
        const autoName = extractedName || `Thành viên ${extractedPhone.slice(-4)}`;
        const { data: created } = await adminClient
          .from('users')
          .insert({
            full_name: autoName,
            phone: extractedPhone,
            email: `member.${extractedPhone}@ulab.vn`,
            role: 'USER',
            current_tier_id: memberTier.id,
            point_balance: 0,
            total_spending: 0,
            locked_points: 0,
          })
          .select(
            'id, full_name, phone, point_balance, total_spending, current_tier_id, upgraded_to_silver, upgraded_to_gold, upgraded_to_diamond'
          )
          .maybeSingle();
        if (created) {
          member = {
            ...created,
            tier: {
              id: memberTier.id,
              code: memberTier.code,
              name: memberTier.name,
              cashback_rate: Number(memberTier.cashback_rate) || 3,
            },
          };
        }
      }
    }
  }

  if (!member) {
    return { pointsEarned: 0 };
  }

  // Rule: Orders with points_used > 0 NEVER earn cashback!
  if (pointsUsed > 0) {
    return {
      pointsEarned: 0,
      memberPointBalance: Number(member.point_balance) || 0,
    };
  }

  if (eligibleDrinkAmount <= 0 || !orderCode) {
    return {
      pointsEarned: 0,
      memberPointBalance: Number(member.point_balance) || 0,
    };
  }

  // Idempotency check: has this orderCode already earned CASHBACK?
  const { data: existingTx } = await adminClient
    .from('point_transactions')
    .select('id, amount')
    .eq('reference_id', orderCode)
    .eq('type', 'CASHBACK')
    .maybeSingle();

  if (existingTx) {
    return {
      pointsEarned: Number(existingTx.amount) || 0,
      memberPointBalance: Number(member.point_balance) || 0,
    };
  }

  const tierRate = resolveTierCashbackRate(member.tier?.code, Number(member.tier?.cashback_rate));
  const cashbackEarned = Math.floor((eligibleDrinkAmount * tierRate) / 100);
  if (cashbackEarned <= 0) {
    return {
      pointsEarned: 0,
      memberPointBalance: Number(member.point_balance) || 0,
    };
  }

  const nowIso = new Date().toISOString();
  const newSpending = (Number(member.total_spending) || 0) + eligibleDrinkAmount;
  let newBalance = (Number(member.point_balance) || 0) + cashbackEarned;
  let newTierId = member.current_tier_id;
  let newTierName = member.tier?.name || 'Member';
  let tierBonus = 0;
  const tierFlagUpdates: Record<string, boolean> = {};

  const { data: allTiers } = await adminClient
    .from('tiers')
    .select('id, code, name, min_spending')
    .order('min_spending', { ascending: false });

  if (allTiers && allTiers.length > 0) {
    for (const t of allTiers) {
      if (newSpending >= Number(t.min_spending)) {
        if (t.id !== member.current_tier_id) {
          newTierId = t.id;
          newTierName = t.name;
          if (t.code === 'SILVER' && !member.upgraded_to_silver) {
            tierBonus = 100000;
            tierFlagUpdates.upgraded_to_silver = true;
          } else if (t.code === 'GOLD' && !member.upgraded_to_gold) {
            tierBonus = 200000;
            tierFlagUpdates.upgraded_to_gold = true;
          } else if (t.code === 'DIAMOND' && !member.upgraded_to_diamond) {
            tierBonus = 45000;
            tierFlagUpdates.upgraded_to_diamond = true;
          }
          newBalance += tierBonus;
        }
        break;
      }
    }
  }

  await adminClient.from('point_transactions').insert({
    user_id: member.id,
    type: 'CASHBACK',
    amount: cashbackEarned,
    balance_after: newBalance - tierBonus,
    reference_id: orderCode,
    description: `Tích điểm (${tierRate}% hạng ${member.tier?.name || 'Member'}) qua SĐT cho đơn ${orderCode}`,
  });

  if (tierBonus > 0) {
    await adminClient.from('point_transactions').insert({
      user_id: member.id,
      type: 'TIER_UP_BONUS',
      amount: tierBonus,
      balance_after: newBalance,
      reference_id: newTierName,
      description: `Thưởng thăng hạng ${newTierName} ✨`,
    });
  }

  await adminClient
    .from('users')
    .update({
      point_balance: newBalance,
      total_spending: newSpending,
      ...(newTierId ? { current_tier_id: newTierId } : {}),
      ...tierFlagUpdates,
      updated_at: nowIso,
    })
    .eq('id', member.id);

  return {
    pointsEarned: cashbackEarned + tierBonus,
    memberPointBalance: newBalance,
  };
}

