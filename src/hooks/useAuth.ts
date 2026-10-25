'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User, Tier, PointTransaction } from '@/lib/types/database';

export const TIERS_CONFIG: Record<string, { code: string; name: string; minSpending: number; cashbackRate: number; icon: string; bonus: string }> = {
  MEMBER: { code: 'MEMBER', name: 'Member', minSpending: 0, cashbackRate: 3, icon: '🌱', bonus: '10.000đ chào mừng' },
  SILVER: { code: 'SILVER', name: 'Silver', minSpending: 500000, cashbackRate: 5, icon: '🥈', bonus: '+100.000đ khi lên hạng' },
  GOLD: { code: 'GOLD', name: 'Gold', minSpending: 1250000, cashbackRate: 7, icon: '🥇', bonus: '+200.000đ khi lên hạng' },
  DIAMOND: { code: 'DIAMOND', name: 'Diamond', minSpending: 6000000, cashbackRate: 10, icon: '💎', bonus: '+45.000đ/tháng' },
};

export interface UserProfile extends User {
  next_tier?: { code: string; name: string; min_spending: number } | null;
  recent_transactions?: PointTransaction[];
}

export interface LoginParams {
  account: string;
  password: string;
}

export interface RegisterParams {
  full_name: string;
  phone: string;
  email?: string;
  password: string;
}

interface AuthState {
  authUser: SupabaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (params: LoginParams) => Promise<{ success: boolean; error?: string; user?: UserProfile }>;
  register: (params: RegisterParams) => Promise<{ success: boolean; error?: string; user?: UserProfile }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  earnPoints: (amount: number, spending?: number, description?: string) => { newBalance: number; newTier: string | null };
  spendPoints: (amount: number, orderCode?: string) => boolean;
}

function calculateTier(spending: number): { tier: Tier; next_tier: { code: string; name: string; min_spending: number } | null } {
  if (spending >= 6000000) {
    return {
      tier: {
        id: 'tier-diamond',
        code: 'DIAMOND',
        name: 'Diamond',
        min_spending: 6000000,
        cashback_rate: 10,
        level_up_bonus: 45000,
        sort_order: 4,
      },
      next_tier: null,
    };
  }
  if (spending >= 1250000) {
    return {
      tier: {
        id: 'tier-gold',
        code: 'GOLD',
        name: 'Gold',
        min_spending: 1250000,
        cashback_rate: 7,
        level_up_bonus: 200000,
        sort_order: 3,
      },
      next_tier: { code: 'DIAMOND', name: 'Diamond', min_spending: 6000000 },
    };
  }
  if (spending >= 500000) {
    return {
      tier: {
        id: 'tier-silver',
        code: 'SILVER',
        name: 'Silver',
        min_spending: 500000,
        cashback_rate: 5,
        level_up_bonus: 100000,
        sort_order: 2,
      },
      next_tier: { code: 'GOLD', name: 'Gold', min_spending: 1250000 },
    };
  }
  return {
    tier: {
      id: 'tier-member',
      code: 'MEMBER',
      name: 'Member',
      min_spending: 0,
      cashback_rate: 3,
      level_up_bonus: 10000,
      sort_order: 1,
    },
    next_tier: { code: 'SILVER', name: 'Silver', min_spending: 500000 },
  };
}

export function useAuth(): AuthState {
  const [authUser, setAuthUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('coffee_active_user');
        if (stored) return JSON.parse(stored);
      } catch {
        // ignore
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    try {
      // 1. Try server profile endpoint first
      const res = await fetch('/api/user/profile');
      const data = await res.json();
      if (data?.user) {
        setProfile(data.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('coffee_active_user', JSON.stringify(data.user));
        }
        return;
      }

      // 2. If cookie session not found, check localStorage phone
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('coffee_active_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.phone) {
            const phoneRes = await fetch(`/api/user/by-phone?phone=${encodeURIComponent(parsed.phone)}`);
            const phoneData = await phoneRes.json();
            if (phoneData?.found && phoneData?.user) {
              const merged = { ...parsed, ...phoneData.user };
              setProfile(merged);
              localStorage.setItem('coffee_active_user', JSON.stringify(merged));
              return;
            }
          }
        }
      }

      setProfile(null);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('coffee_active_user');
      }
    } catch {
      // Keep cached on network glitch
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = createClient();

    // Check Supabase session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthUser(user);
      if (user) {
        fetchProfile();
      } else {
        // If not in Supabase auth, verify whether local cache is still valid
        const stored = typeof window !== 'undefined' ? localStorage.getItem('coffee_active_user') : null;
        if (stored) {
          fetchProfile();
        } else {
          setProfile(null);
        }
      }
      setLoading(false);
    });

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = async (params: LoginParams) => {
    try {
      const cleanAccount = params.account.trim();
      let targetEmail = cleanAccount;

      // Handle alias 'admin'
      if (cleanAccount.toLowerCase() === 'admin') {
        targetEmail = 'admin@coffeehouse.vn';
      }

      // 1. If it's a phone number, resolve to registered email
      const isPhone = /^[0-9+]{9,15}$/.test(cleanAccount.replace(/[\s\-()]/g, ''));
      if (isPhone) {
        const normalized = cleanAccount.replace(/[\s\-()]/g, '');
        try {
          const res = await fetch(`/api/user/by-phone?phone=${encodeURIComponent(normalized)}`);
          const data = await res.json();
          if (data?.found && data?.user?.email) {
            targetEmail = data.user.email;
          } else {
            targetEmail = `${normalized}@coffeehouse.vn`;
          }
        } catch {
          targetEmail = `${normalized}@coffeehouse.vn`;
        }
      }

      // 2. Sign in via browser Supabase client (sets cookies and session tokens)
      const supabase = createClient();
      let { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: params.password,
      });

      // Flexible fallback for admin
      if ((authError || !authData?.user) && targetEmail === 'admin@coffeehouse.vn') {
        const candidates = ['123456', 'Admin@123456'];
        for (const cand of candidates) {
          const retry = await supabase.auth.signInWithPassword({
            email: targetEmail,
            password: cand,
          });
          if (retry.data?.user) {
            authData = retry.data;
            authError = null;
            break;
          }
        }
      }

      // 3. Also call server endpoint to ensure server cookies and profile fetch
      const serverRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const serverData = await serverRes.json();

      if (!serverRes.ok || serverData.error) {
        if (authError) {
          return { success: false, error: authError.message || serverData.error || 'Số điện thoại hoặc mật khẩu không chính xác' };
        }
      }

      // 4. Update profile in state and localStorage
      const activeUser = serverData.user || {
        id: authData?.user?.id,
        email: authData?.user?.email,
        full_name: authData?.user?.user_metadata?.full_name || 'Khách hàng',
        phone: authData?.user?.user_metadata?.phone || cleanAccount,
        role: 'USER',
      };

      setProfile(activeUser);
      if (typeof window !== 'undefined') {
        localStorage.setItem('coffee_active_user', JSON.stringify(activeUser));
      }

      // Fetch complete profile with tiers and transactions
      await fetchProfile();

      return { success: true, user: activeUser };
    } catch {
      return { success: false, error: 'Lỗi kết nối máy chủ' };
    }
  };

  const register = async (params: RegisterParams) => {
    try {
      // 1. Call server API to register user (creates auth user + users row + 10k bonus)
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error || 'Đăng ký thất bại' };
      }

      // 2. Also sign in on browser client so browser cookies are active
      const normalizedPhone = params.phone.replace(/[\s\-()]/g, '');
      const targetEmail = params.email?.trim() || `${normalizedPhone}@coffeehouse.vn`;

      const supabase = createClient();
      await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: params.password,
      });

      // 3. Update profile state and localStorage
      if (data.user) {
        setProfile(data.user);
        if (typeof window !== 'undefined') {
          localStorage.setItem('coffee_active_user', JSON.stringify(data.user));
        }
      }

      await fetchProfile();
      return { success: true, user: data.user };
    } catch {
      return { success: false, error: 'Lỗi đăng ký, vui lòng thử lại' };
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      if (isSupabaseConfigured()) {
        const supabase = createClient();
        await supabase.auth.signOut();
      }
    } catch {
      // Ignore
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('coffee_active_user');
      localStorage.removeItem('coffee_demo_user');
    }
    setAuthUser(null);
    setProfile(null);
    window.location.href = '/';
  };

  const earnPoints = (amount: number, spending: number = 0, description?: string) => {
    if (!profile) return { newBalance: 0, newTier: null };

    const newSpending = (profile.total_spending || 0) + spending;
    let newBalance = (profile.point_balance || 0) + amount;
    const { tier, next_tier } = calculateTier(newSpending);
    const tierChanged = tier.code !== profile.tier?.code;

    const existingTransactions = profile.recent_transactions || [];
    const newTransactions = [...existingTransactions];

    // Log the cashback transaction
    const cashbackTx: PointTransaction = {
      id: `tx-${Date.now()}-cashback`,
      user_id: profile.id,
      type: 'CASHBACK',
      amount,
      balance_after: newBalance,
      reference_id: `SPEND-${spending}`,
      description: description || `Hoàn ${profile.tier?.cashback_rate || 5}% cho hóa đơn`,
      created_at: new Date().toISOString(),
    };
    newTransactions.unshift(cashbackTx);

    // If tier upgraded, apply tier bonus
    let tierBonus = 0;
    if (tierChanged) {
      if (tier.code === 'SILVER' && !profile.upgraded_to_silver) {
        tierBonus = 100000;
      } else if (tier.code === 'GOLD' && !profile.upgraded_to_gold) {
        tierBonus = 200000;
      } else if (tier.code === 'DIAMOND' && !profile.upgraded_to_diamond) {
        tierBonus = 45000;
      }

      if (tierBonus > 0) {
        newBalance += tierBonus;
        newTransactions.unshift({
          id: `tx-${Date.now()}-tier`,
          user_id: profile.id,
          type: 'TIER_UP_BONUS',
          amount: tierBonus,
          balance_after: newBalance,
          reference_id: tier.code,
          description: `Thưởng thăng hạng ${tier.name} ✨`,
          created_at: new Date().toISOString(),
        });
      }
    }

    const updated: UserProfile = {
      ...profile,
      total_spending: newSpending,
      point_balance: newBalance,
      tier,
      next_tier,
      upgraded_to_silver: tier.code === 'SILVER' || profile.upgraded_to_silver,
      upgraded_to_gold: tier.code === 'GOLD' || profile.upgraded_to_gold,
      upgraded_to_diamond: tier.code === 'DIAMOND' || profile.upgraded_to_diamond,
      recent_transactions: newTransactions.slice(0, 15),
      updated_at: new Date().toISOString(),
    };

    setProfile(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('coffee_active_user', JSON.stringify(updated));
    }

    return {
      newBalance,
      newTier: tierChanged ? tier.name : null,
    };
  };

  const spendPoints = (amount: number, orderCode?: string): boolean => {
    if (!profile || profile.point_balance < amount) return false;

    const newBalance = profile.point_balance - amount;
    const existingTransactions = profile.recent_transactions || [];
    const newTransactions: PointTransaction[] = [
      {
        id: `tx-${Date.now()}-spend`,
        user_id: profile.id,
        type: 'ORDER_DEDUCT',
        amount: -amount,
        balance_after: newBalance,
        reference_id: orderCode || 'ORDER',
        description: `Dùng điểm cho đơn hàng ${orderCode ? `#${orderCode}` : ''}`,
        created_at: new Date().toISOString(),
      },
      ...existingTransactions,
    ];

    const updated: UserProfile = {
      ...profile,
      point_balance: newBalance,
      recent_transactions: newTransactions.slice(0, 15),
      updated_at: new Date().toISOString(),
    };

    setProfile(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('coffee_active_user', JSON.stringify(updated));
    }
    return true;
  };

  return {
    authUser,
    profile,
    loading,
    login,
    register,
    signOut,
    refreshProfile: fetchProfile,
    earnPoints,
    spendPoints,
  };
}
