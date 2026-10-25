export type TierCode = 'MEMBER' | 'SILVER' | 'GOLD' | 'DIAMOND';

export interface Tier {
  id: string;
  code: TierCode;
  name: string;
  min_spending: number;
  cashback_rate: number;
  level_up_bonus: number;
  sort_order: number;
}

export interface User {
  id: string;
  google_id: string | null;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN';
  current_tier_id: string;
  total_spending: number;
  point_balance: number;
  locked_points: number;
  received_welcome_10k: boolean;
  upgraded_to_silver: boolean;
  upgraded_to_gold: boolean;
  upgraded_to_diamond: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  tier?: Tier;
}

export interface QRToken {
  code: string;
  drink_value: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  created_by: string | null;
  scanned_by: string | null;
  scanned_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface PointTransaction {
  id: string;
  user_id: string;
  type:
    | 'CASHBACK'
    | 'WELCOME_BONUS'
    | 'TIER_UP_BONUS'
    | 'MONTHLY_BONUS'
    | 'ORDER_DEDUCT'
    | 'ORDER_CONFIRM'
    | 'ORDER_CANCEL_REFUND';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
}

export interface Order {
  id: string;
  order_code: string;
  user_id: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED';
  subtotal: number;
  points_used: number;
  total_due: number;
  note: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  items?: OrderItem[];
  user?: User;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  size: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface MenuCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  is_available: boolean;
  is_signature: boolean;
  sort_order: number;
  sizes?: MenuItemSize[];
}

export interface MenuItemSize {
  id: string;
  menu_item_id: string;
  size_label: string;
  price: number;
  is_available: boolean;
  sort_order: number;
}

// Database helper type
export interface Database {
  public: {
    Tables: {
      tiers: { Row: Tier };
      users: { Row: User };
      qr_tokens: { Row: QRToken };
      point_transactions: { Row: PointTransaction };
      orders: { Row: Order };
      order_items: { Row: OrderItem };
      menu_categories: { Row: MenuCategory };
      menu_items: { Row: MenuItem };
      menu_item_sizes: { Row: MenuItemSize };
    };
  };
}
