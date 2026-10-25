import { create } from 'zustand';
import { MenuItem } from '@/data/menu';

export interface CartItem {
  menuItem: MenuItem;
  sizeIndex: number;
  sizeLabel: string;
  price: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  pointsToUse: number;
  addItem: (item: MenuItem, sizeIndex: number) => void;
  removeItem: (menuItemId: string, sizeIndex: number) => void;
  updateQuantity: (menuItemId: string, sizeIndex: number, quantity: number) => void;
  setPointsToUse: (points: number) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getTotalDue: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  pointsToUse: 0,

  addItem: (item, sizeIndex) => {
    const size = item.sizes[sizeIndex];
    set((state) => {
      const existing = state.items.find(
        (ci) => ci.menuItem.id === item.id && ci.sizeIndex === sizeIndex
      );

      if (existing) {
        return {
          items: state.items.map((ci) =>
            ci.menuItem.id === item.id && ci.sizeIndex === sizeIndex
              ? { ...ci, quantity: ci.quantity + 1 }
              : ci
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            menuItem: item,
            sizeIndex,
            sizeLabel: size.label,
            price: size.price,
            quantity: 1,
          },
        ],
      };
    });
  },

  removeItem: (menuItemId, sizeIndex) => {
    set((state) => ({
      items: state.items.filter(
        (ci) => !(ci.menuItem.id === menuItemId && ci.sizeIndex === sizeIndex)
      ),
    }));
  },

  updateQuantity: (menuItemId, sizeIndex, quantity) => {
    if (quantity <= 0) {
      get().removeItem(menuItemId, sizeIndex);
      return;
    }
    set((state) => ({
      items: state.items.map((ci) =>
        ci.menuItem.id === menuItemId && ci.sizeIndex === sizeIndex
          ? { ...ci, quantity }
          : ci
      ),
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
