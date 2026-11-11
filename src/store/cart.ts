import { create } from 'zustand';
import { MenuItem, MENU_ADDONS, type MenuAddon, type MilkOption } from '@/data/menu';

export interface CartItemOptions {
  milkOption?: MilkOption;
  addons?: string[]; // addon IDs from MENU_ADDONS
}

export interface CartItem {
  cartKey: string;
  menuItem: MenuItem;
  sizeIndex: number;
  sizeLabel: string;
  basePrice: number;
  addonPrice: number;
  price: number; // basePrice + addonPrice
  quantity: number;
  milkOption?: MilkOption;
  addons: MenuAddon[];
}

function buildCartKey(itemId: string, sizeIndex: number, milkOption?: string, addonIds?: string[]): string {
  const sortedAddons = (addonIds || []).slice().sort().join(',');
  return `${itemId}__${sizeIndex}__${milkOption || 'default'}__${sortedAddons}`;
}

function resolveMenuAddons(addonIds?: string[]): { addons: MenuAddon[]; addonPrice: number } {
  if (!addonIds || addonIds.length === 0) return { addons: [], addonPrice: 0 };
  const unique = Array.from(new Set(addonIds));
  const addons = unique
    .map((id) => MENU_ADDONS.find((a) => a.id === id))
    .filter((a): a is MenuAddon => Boolean(a));
  const addonPrice = addons.reduce((s, a) => s + a.price, 0);
  return { addons, addonPrice };
}

interface CartState {
  items: CartItem[];
  pointsToUse: number;
  addItem: (item: MenuItem, sizeIndex: number, options?: CartItemOptions) => void;
  removeItem: (menuItemId: string, sizeIndex: number, cartKey?: string) => void;
  updateQuantity: (menuItemId: string, sizeIndex: number, quantity: number, cartKey?: string) => void;
  updateItemMilk: (cartKey: string, milkOption: MilkOption) => void;
  toggleItemAddon: (cartKey: string, addonId: string) => void;
  setPointsToUse: (points: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalDue: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  pointsToUse: 0,

  addItem: (item, sizeIndex, options) => {
    const size = item.sizes[sizeIndex] || item.sizes[0];
    const isBottled = size.label === 'Chai' || item.categorySlug === 'cold-brew-chai';
    const milkOption: MilkOption | undefined =
      !isBottled && item.hasMilkChoice
        ? options?.milkOption || 'Sữa thanh trùng'
        : undefined;
    const { addons, addonPrice } = isBottled
      ? { addons: [], addonPrice: 0 }
      : resolveMenuAddons(options?.addons);
    const addonIds = addons.map((a) => a.id);
    const cartKey = buildCartKey(item.id, sizeIndex, milkOption, addonIds);
    const unitPrice = size.price + addonPrice;

    set((state) => {
      const existing = state.items.find((ci) => ci.cartKey === cartKey);

      if (existing) {
        return {
          items: state.items.map((ci) =>
            ci.cartKey === cartKey
              ? { ...ci, quantity: ci.quantity + 1 }
              : ci
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            cartKey,
            menuItem: item,
            sizeIndex,
            sizeLabel: size.label,
            basePrice: size.price,
            addonPrice,
            price: unitPrice,
            quantity: 1,
            milkOption,
            addons,
          },
        ],
      };
    });
  },

  removeItem: (menuItemId, sizeIndex, cartKey) => {
    set((state) => ({
      items: state.items.filter((ci) =>
        cartKey
          ? ci.cartKey !== cartKey
          : !(ci.menuItem.id === menuItemId && ci.sizeIndex === sizeIndex)
      ),
    }));
  },

  updateQuantity: (menuItemId, sizeIndex, quantity, cartKey) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId, sizeIndex, cartKey);
      return;
    }
    set((state) => ({
      items: state.items.map((ci) =>
        (cartKey ? ci.cartKey === cartKey : ci.menuItem.id === menuItemId && ci.sizeIndex === sizeIndex)
          ? { ...ci, quantity }
          : ci
      ),
    }));
  },

  updateItemMilk: (cartKey, milkOption) => {
    set((state) => ({
      items: state.items.map((ci) => {
        if (ci.cartKey !== cartKey) return ci;
        const addonIds = ci.addons.map((a) => a.id);
        const nextKey = buildCartKey(ci.menuItem.id, ci.sizeIndex, milkOption, addonIds);
        return {
          ...ci,
          cartKey: nextKey,
          milkOption,
        };
      }),
    }));
  },

  toggleItemAddon: (cartKey, addonId) => {
    set((state) => ({
      items: state.items.map((ci) => {
        if (ci.cartKey !== cartKey) return ci;
        const currentIds = ci.addons.map((a) => a.id);
        const nextIds = currentIds.includes(addonId)
          ? currentIds.filter((id) => id !== addonId)
          : [...currentIds, addonId];
        const { addons, addonPrice } = resolveMenuAddons(nextIds);
        const nextKey = buildCartKey(ci.menuItem.id, ci.sizeIndex, ci.milkOption, nextIds);
        return {
          ...ci,
          cartKey: nextKey,
          addons,
          addonPrice,
          price: ci.basePrice + addonPrice,
        };
      }),
    }));
  },

  setPointsToUse: (points) => set({ pointsToUse: Math.max(0, points) }),

  clearCart: () => set({ items: [], pointsToUse: 0 }),

  getSubtotal: () => {
    return get().items.reduce((sum, ci) => sum + ci.price * ci.quantity, 0);
  },

  getTotalDue: () => {
    const subtotal = get().getSubtotal();
    return Math.max(0, subtotal - get().pointsToUse);
  },

  getItemCount: () => {
    return get().items.reduce((sum, ci) => sum + ci.quantity, 0);
  },
}));
