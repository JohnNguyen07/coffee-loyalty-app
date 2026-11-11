// Menu data synced with Ủ LAB latest menu
// Categories: Cold Brew, Matcha, Cold Brew Chai

export interface MenuItemSize {
  label: string;
  price: number;
}

export interface MenuAddon {
  id: string;
  name: string;
  price: number;
}

export const MENU_ADDONS: MenuAddon[] = [
  { id: 'kem-beo', name: 'Kem Béo', price: 5000 },
  { id: '1g-matcha-fuji', name: '1g Matcha Fuji', price: 5000 },
];

export const MILK_OPTIONS = ['Sữa thanh trùng', 'Sữa Oat'] as const;
export type MilkOption = (typeof MILK_OPTIONS)[number];

export interface MenuItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  categorySlug: string;
  sizes: MenuItemSize[];
  isSignature?: boolean;
  badgeLabel?: string; // 'Signature' | 'Special'
  hasMilkChoice?: boolean; // Free switch between Sữa thanh trùng & Sữa Oat
  shelfLife?: string; // For bottled products
  tag?: string;
  isAvailable?: boolean;
}

export interface MenuCategory {
  name: string;
  slug: string;
  icon: string;
  subtitle?: string;
  items: MenuItem[];
}

export const menuData: MenuCategory[] = [
  {
    name: 'Cold Brew',
    slug: 'cold-brew',
    icon: '🧊',
    subtitle: 'Size M / Size L · Chiết xuất lạnh chậm 18 giờ từ hạt Arabica Cầu Đất',
    items: [
      {
        id: 'original-cold-brew',
        name: 'Original Cold Brew',
        description: 'Cà phê ủ lạnh 18h',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: '18h Steeped',
        sizes: [
          { label: 'M', price: 30000 },
          { label: 'L', price: 35000 },
        ],
      },
      {
        id: 'cold-brew-cam-sa',
        name: 'Cold Brew Cam Sả',
        description: 'Hương cam vàng kết hợp sả thanh nhẹ',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Signature',
        isSignature: true,
        badgeLabel: 'Signature',
        sizes: [
          { label: 'M', price: 35000 },
          { label: 'L', price: 40000 },
        ],
      },
      {
        id: 'cold-brew-dau-tam',
        name: 'Cold Brew Dâu Tằm',
        description: 'Vị ngọt thanh từ dâu tằm tự nhiên',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Dâu Tằm',
        sizes: [
          { label: 'M', price: 35000 },
          { label: 'L', price: 40000 },
        ],
      },
      {
        id: 'cold-brew-strawberry',
        name: 'Cold Brew Strawberry',
        description: 'Hòa quyện dâu tây chua ngọt thanh mát',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Strawberry',
        sizes: [
          { label: 'M', price: 35000 },
          { label: 'L', price: 40000 },
        ],
      },
      {
        id: 'cold-brew-buoi-hong',
        name: 'Cold Brew Bưởi Hồng',
        description: 'Hương bưởi hồng tươi mới, sảng khoái',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Bưởi Hồng',
        sizes: [
          { label: 'M', price: 35000 },
          { label: 'L', price: 40000 },
        ],
      },
      {
        id: 'cold-brew-chanh-vang',
        name: 'Cold Brew Chanh Vàng',
        description: 'Cà phê ủ lạnh dùng với syrup chanh vàng',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Refreshing',
        sizes: [
          { label: 'M', price: 30000 },
          { label: 'L', price: 35000 },
        ],
      },
      {
        id: 'cold-brew-nuoc-dua',
        name: 'Cold Brew Nước Dừa',
        description: 'Cà phê ủ lạnh dùng với nước dừa tươi',
        category: 'Cold Brew',
        categorySlug: 'cold-brew',
        tag: 'Tropical',
        sizes: [
          { label: 'M', price: 30000 },
          { label: 'L', price: 35000 },
        ],
      },
    ],
  },
  {
    name: 'Matcha',
    slug: 'matcha',
    icon: '🍵',
    subtitle: 'Size M · Bột trà xanh Fuji MK4 nguyên chất · Miễn phí đổi Sữa thanh trùng / Sữa Oat',
    items: [
      {
        id: 'matcha-latte',
        name: 'Matcha Latte',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        category: 'Matcha',
        categorySlug: 'matcha',
        tag: 'Fuji MK4',
        hasMilkChoice: true,
        sizes: [
          { label: 'M', price: 40000 },
        ],
      },
      {
        id: 'matcha-kem-beo',
        name: 'Matcha Kem Béo',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        category: 'Matcha',
        categorySlug: 'matcha',
        tag: 'Signature',
        isSignature: true,
        badgeLabel: 'Signature',
        hasMilkChoice: true,
        sizes: [
          { label: 'M', price: 45000 },
        ],
      },
      {
        id: 'strawberry-matcha',
        name: 'Strawberry Matcha',
        description: '5g matcha · Sữa thanh trùng / Sữa Oat',
        category: 'Matcha',
        categorySlug: 'matcha',
        tag: 'Dâu Tươi',
        hasMilkChoice: true,
        sizes: [
          { label: 'M', price: 45000 },
        ],
      },
      {
        id: 'matcha-coco',
        name: 'Matcha Coco',
        description: '5g matcha kết hợp với nước dừa',
        category: 'Matcha',
        categorySlug: 'matcha',
        tag: 'Light & Fresh',
        hasMilkChoice: false,
        sizes: [
          { label: 'M', price: 40000 },
        ],
      },
      {
        id: 'matcha-cold-whisk',
        name: 'Matcha Cold Whisk',
        description: '7g matcha đánh lạnh · Sữa thanh trùng / Sữa Oat',
        category: 'Matcha',
        categorySlug: 'matcha',
        tag: 'Special',
        isSignature: true,
        badgeLabel: 'Special',
        hasMilkChoice: true,
        sizes: [
          { label: 'M', price: 45000 },
        ],
      },
    ],
  },
  {
    name: 'Cold Brew Chai',
    slug: 'cold-brew-chai',
    icon: '🍾',
    subtitle: 'Chai đóng sẵn tiện lợi · Ủ lạnh thủ công 18 giờ',
    items: [
      {
        id: 'cold-brew-chanh-vang-chai',
        name: 'Cold Brew Chanh Vàng',
        description: 'Bottled Craft · Bảo quản lạnh: 5–7 ngày',
        category: 'Cold Brew Chai',
        categorySlug: 'cold-brew-chai',
        tag: 'Bottled Craft',
        sizes: [
          { label: 'Chai', price: 90000 },
        ],
        shelfLife: '5–7 ngày',
      },
      {
        id: 'pure-black-cold-brew',
        name: 'Pure Black Cold Brew',
        description: 'Zero Sugar · Bảo quản lạnh: 7–10 ngày',
        category: 'Cold Brew Chai',
        categorySlug: 'cold-brew-chai',
        tag: 'Zero Sugar',
        sizes: [
          { label: 'Chai', price: 80000 },
        ],
        shelfLife: '7–10 ngày',
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
