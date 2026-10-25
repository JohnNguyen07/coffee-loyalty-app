// Menu data extracted from current offerings
// Categories: Cold Brew, Matcha, Cold Brew Chai

export interface MenuItemSize {
  label: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  category: string;
  categorySlug: string;
  sizes: MenuItemSize[];
  isSignature?: boolean;
  shelfLife?: string; // For bottled products
}

export interface MenuCategory {
  name: string;
  slug: string;
  icon: string;
  items: MenuItem[];
}

export const menuData: MenuCategory[] = [
  {
    name: 'Cold Brew',
    slug: 'cold-brew',
    icon: '🧊',
    items: [
      {
        id: 'original-cold-brew',
        name: 'Original Cold Brew',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        sizes: [
          { label: 'M', price: 29000 },
          { label: 'L', price: 34000 },
        ],
      },
      {
        id: 'cold-brew-cam-sa',
        name: 'Cold Brew Cam Sả',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        sizes: [
          { label: 'M', price: 34000 },
          { label: 'L', price: 39000 },
        ],
      },
      {
        id: 'cold-brew-vai',
        name: 'Cold Brew Vải',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        sizes: [
          { label: 'M', price: 34000 },
          { label: 'L', price: 39000 },
        ],
      },
      {
        id: 'cold-brew-chanh-vang',
        name: 'Cold Brew Chanh Vàng',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        sizes: [
          { label: 'M', price: 29000 },
          { label: 'L', price: 34000 },
        ],
      },
      {
        id: 'cold-brew-nuoc-dua',
        name: 'Cold Brew Nước Dừa',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        sizes: [
          { label: 'M', price: 29000 },
          { label: 'L', price: 34000 },
        ],
      },
    ],
  },
  {
    name: 'Matcha',
    slug: 'matcha',
    icon: '🍵',
    items: [
      {
        id: 'matcha-latte',
        name: 'Matcha Latte',
        category: 'Matcha',
        categorySlug: 'matcha',
        sizes: [
          { label: 'M', price: 34000 },
          { label: 'L', price: 39000 },
        ],
      },
      {
        id: 'matcha-coco',
        name: 'Matcha Coco',
        category: 'Matcha',
        categorySlug: 'matcha',
        sizes: [
          { label: 'M', price: 34000 },
          { label: 'L', price: 39000 },
        ],
      },
      {
        id: 'matcha-oat',
        name: 'Matcha Oat',
        category: 'Matcha',
        categorySlug: 'matcha',
        sizes: [
          { label: 'M', price: 34000 },
          { label: 'L', price: 39000 },
        ],
      },
      {
        id: 'matcha-cold-whisk',
        name: 'Matcha Cold Whisk',
        category: 'Matcha',
        categorySlug: 'matcha',
        sizes: [
          { label: 'M', price: 42000 },
          { label: 'L', price: 46000 },
        ],
        isSignature: true,
      },
    ],
  },
  {
    name: 'Cold Brew Chai',
    slug: 'cold-brew-chai',
    icon: '🍾',
    items: [
      {
        id: 'cold-brew-chanh-vang-chai',
        name: 'Cold Brew Chanh Vàng',
        category: 'Cold Brew Chai',
        categorySlug: 'cold-brew-chai',
        sizes: [
          { label: 'Chai', price: 74000 },
        ],
        shelfLife: '5 – 7 ngày',
      },
      {
        id: 'pure-black-cold-brew',
        name: 'Pure Black Cold Brew',
        category: 'Cold Brew Chai',
        categorySlug: 'cold-brew-chai',
        sizes: [
          { label: 'Chai', price: 69000 },
        ],
        shelfLife: '7 – 10 ngày',
      },
    ],
  },
];

// Flatten all items for easy search/filter
export const allMenuItems: MenuItem[] = menuData.flatMap((cat) => cat.items);

// Helper: format VND
export function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

// Helper: get all unique price values for POS quick buttons
export function getQuickPrices(): number[] {
  const prices = new Set<number>();
  allMenuItems.forEach((item) => {
    item.sizes.forEach((size) => {
      prices.add(size.price);
    });
  });
  return Array.from(prices).sort((a, b) => a - b);
}
