'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import styles from './POSPanel.module.css';
import {
  menuData as fallbackMenuData,
  getQuickPrices,
  formatVND,
  type MenuCategory,
  type MenuItem,
} from '@/data/menu';
import {
  ADDON_OPTIONS,
  ICE_OPTIONS,
  SWEETNESS_OPTIONS,
  CASHIER_MAX_DISCOUNT_AMOUNT,
  CASHIER_MAX_DISCOUNT_PERCENT,
  calculatePosOrderTotals,
  formatItemOptionsSummary,
  type DiscountType,
  type OrderType,
  type PaymentMethod,
  type StaffRole,
} from '@/lib/pos/domain';
import {
  buildBaristaTicketHtml,
  buildCustomerReceiptHtml,
} from '@/lib/pos/print-templates';
import type { PosOrderRecord } from '@/lib/pos/repository';
import CustomersPanel from './CustomersPanel';
import QRCode from 'qrcode';

interface PosCartLine {
  lineId: string;
  itemId: string;
  productName: string;
  sizeLabel: string;
  basePrice: number;
  quantity: number;
  sweetness: string;
  ice: string;
  addons: string[];
  itemNote: string;
}

interface GeneratedQR {
  code: string;
  price: number;
  label?: string;
  qrDataUrl: string;
  scanUrl: string;
  createdAt: string;
}

interface DBQRToken {
  id?: string;
  code: string;
  drink_value: number;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
  scanned_by?: string | null;
  scanned_at?: string | null;
  expires_at?: string;
  created_at?: string;
  scanner?: {
    full_name?: string;
    phone?: string;
    email?: string;
  } | null;
}

interface LinkedCustomer {
  id: string;
  full_name: string;
  phone: string;
  point_balance: number;
  tier_name?: string;
  cashback_rate?: number;
}

const ORDER_QUICK_NOTES = ['Ít ngọt', 'Đá riêng', 'Không ống hút', 'Làm gấp'];

export default function POSPanel() {
  // Mode switch: 'pos' (M01 Counter POS) vs 'qr' (Legacy single QR sticker generator)
  const [activeMode, setActiveMode] = useState<'pos' | 'qr'>('pos');

  // ── POS Menu & Staff State ──
  const [categories, setCategories] = useState<MenuCategory[]>(fallbackMenuData);
  const [loadingMenu, setLoadingMenu] = useState<boolean>(true);
  const [menuError, setMenuError] = useState<string | null>(null);
  const [staffInfo, setStaffInfo] = useState<{
    fullName: string;
    staffRole: StaffRole;
    locationName: string;
  }>({
    fullName: 'Quản trị viên Ủ LAB',
    staffRole: 'ADMIN',
    locationName: 'Ủ LAB — Quầy Chính',
  });

  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [menuSearch, setMenuSearch] = useState<string>('');

  // ── POS Cart & Customization State ──
  const [cartLines, setCartLines] = useState<PosCartLine[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('TAKEAWAY');
  const [orderNote, setOrderNote] = useState<string>('');

  // ── Customer Lookup & Loyalty Points State ──
  const [customerPhoneInput, setCustomerPhoneInput] = useState<string>('');
  const [customerNameInput, setCustomerNameInput] = useState<string>('');
  const [linkedCustomer, setLinkedCustomer] = useState<LinkedCustomer | null>(null);
  const [lookingUpCustomer, setLookingUpCustomer] = useState<boolean>(false);
  const [customerLookupMsg, setCustomerLookupMsg] = useState<string | null>(null);
  const [pointsToUse, setPointsToUse] = useState<number>(0);

  // ── Discount State (Role-based) ──
  const [discountType, setDiscountType] = useState<DiscountType>('NONE');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [discountReason, setDiscountReason] = useState<string>('');

  // ── Payment State ──
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    `pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  // ── Completed Order Modal (Barista Ticket & Receipt Preview) ──
  const [completedOrder, setCompletedOrder] = useState<PosOrderRecord | null>(null);
  const [completedOrderQrDataUrl, setCompletedOrderQrDataUrl] = useState<string>('');
  const [previewTab, setPreviewTab] = useState<'receipt' | 'barista'>('receipt');

  // ── Recent Orders & Cancellation State ──
  const [recentOrders, setRecentOrders] = useState<PosOrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(true);
  const [ordersFilterStatus, setOrdersFilterStatus] = useState<string>('ALL');
  const [ordersSearch, setOrdersSearch] = useState<string>('');
  const [ordersDate, setOrdersDate] = useState<string>('');
  const [cancellingOrder, setCancellingOrder] = useState<PosOrderRecord | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [showRecentOrdersTable, setShowRecentOrdersTable] = useState<boolean>(false);
  const [isRegisteringCustomer, setIsRegisteringCustomer] = useState<boolean>(false);

  // ── Legacy QR Sticker Generator State (kept 100% compatible) ──
  const quickPrices = getQuickPrices();
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [qrCatSlug, setQrCatSlug] = useState<string>('all');
  const [currentQR, setCurrentQR] = useState<GeneratedQR | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [dbTokens, setDbTokens] = useState<DBQRToken[]>([]);
  const [dbStats, setDbStats] = useState({ active: 0, used: 0, total: 0 });
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'USED'>('ALL');
  const [searchCode, setSearchCode] = useState('');

  const buildScanUrl = (qrCode: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    return `${origin}/scan?code=${encodeURIComponent(qrCode)}`;
  };

  // 1. Load POS Menu & Staff Context
  const fetchPosMenu = useCallback(async () => {
    setLoadingMenu(true);
    setMenuError(null);
    try {
      const res = await fetch('/api/pos/menu', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          setCategories(data.categories);
        }
        if (data.staff) {
          setStaffInfo({
            fullName: data.staff.fullName || 'Thu ngân Ủ LAB',
            staffRole: data.staff.staffRole || 'ADMIN',
            locationName: data.staff.locationName || 'Ủ LAB — Quầy Chính',
          });
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setMenuError(errData.error || 'Không thể tải menu từ máy chủ, đang hiển thị danh mục mặc định.');
      }
    } catch {
      setMenuError('Không thể kết nối máy chủ menu, đang hiển thị danh mục mặc định.');
    } finally {
      setLoadingMenu(false);
    }
  }, []);

  // Listen for menu availability & price updates from Products tab and order imports from Orders tab
  useEffect(() => {
    const handleMenuChanged = () => {
      fetchPosMenu();
    };
    const handleLoadOrder = (e: Event) => {
      const customEvent = e as CustomEvent;
      const order = customEvent.detail?.order;
      if (!order) return;
      setActiveMode('pos');
      if (order.customer_phone && order.customer_phone !== '—') {
        setCustomerPhoneInput(order.customer_phone);
        setCustomerNameInput(order.customer_name);
      }
      if (order.note) {
        setOrderNote(`[Đơn #${order.order_code}] ${order.note}`);
      }
      if (Array.isArray(order.items) && order.items.length > 0) {
        const lines: PosCartLine[] = order.items.map((it: { item_name: string; size_label: string; unit_price: number; quantity: number }, idx: number) => ({
          lineId: `line-import-${Date.now()}-${idx}`,
          itemId: `import-${idx}`,
          productName: it.item_name,
          sizeLabel: it.size_label || 'M',
          basePrice: it.unit_price,
          quantity: it.quantity,
          sweetness: '100% đường',
          ice: '100% đá',
          addons: [],
          itemNote: '',
        }));
        setCartLines(lines);
      }
    };

    window.addEventListener('ulab:menu-changed', handleMenuChanged);
    window.addEventListener('ulab:load-pos-order', handleLoadOrder);
    return () => {
      window.removeEventListener('ulab:menu-changed', handleMenuChanged);
      window.removeEventListener('ulab:load-pos-order', handleLoadOrder);
    };
  }, [fetchPosMenu]);

  // 2. Load Recent POS Orders
  const fetchRecentOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const params = new URLSearchParams();
      if (ordersFilterStatus !== 'ALL') params.set('status', ordersFilterStatus);
      if (ordersSearch.trim()) params.set('search', ordersSearch.trim());
      if (ordersDate) params.set('date', ordersDate);
      params.set('limit', '30');

      const res = await fetch(`/api/pos/orders?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setRecentOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Fetch POS orders error:', err);
    } finally {
      setLoadingOrders(false);
    }
  }, [ordersFilterStatus, ordersSearch, ordersDate]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/pos/menu', { cache: 'no-store' });
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.categories) && data.categories.length > 0) {
            setCategories(data.categories);
          }
          if (data.staff) {
            setStaffInfo({
              fullName: data.staff.fullName || 'Thu ngân Ủ LAB',
              staffRole: data.staff.staffRole || 'ADMIN',
              locationName: data.staff.locationName || 'Ủ LAB — Quầy Chính',
            });
          }
        }
      } catch {
        // keep fallback menu
      } finally {
        if (isMounted) setLoadingMenu(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (ordersFilterStatus !== 'ALL') params.set('status', ordersFilterStatus);
        if (ordersSearch.trim()) params.set('search', ordersSearch.trim());
        if (ordersDate) params.set('date', ordersDate);
        params.set('limit', '30');

        const res = await fetch(`/api/pos/orders?${params.toString()}`, { cache: 'no-store' });
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setRecentOrders(data.orders || []);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setLoadingOrders(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [ordersFilterStatus, ordersSearch, ordersDate]);

  // Flatten catalog for calculation
  const flatCatalog = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  // Filtered menu categories & items for display
  const displayedCategories = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return categories
      .filter((c) => selectedCategorySlug === 'all' || c.slug === selectedCategorySlug)
      .map((c) => ({
        ...c,
        items: c.items.filter((item) => !q || item.name.toLowerCase().includes(q)),
      }))
      .filter((c) => c.items.length > 0);
  }, [categories, selectedCategorySlug, menuSearch]);

  // Live Cart & Order Calculation using domain logic
  const parsedDiscountVal = Number(discountValue.replace(/\D/g, '')) || 0;
  const calculation = useMemo(() => {
    return calculatePosOrderTotals({
      items: cartLines.map((line) => ({
        itemId: line.itemId,
        productName: line.productName,
        sizeLabel: line.sizeLabel,
        quantity: line.quantity,
        unitPriceOverride: line.basePrice,
        options: {
          sweetness: line.sweetness,
          ice: line.ice,
          addons: line.addons,
        },
        itemNote: line.itemNote,
      })),
      discount: {
        type: discountType,
        value: parsedDiscountVal,
        reason: discountReason || 'Giảm giá tại quầy',
      },
      pointsRequested: pointsToUse,
      availableMemberPoints: linkedCustomer?.point_balance || 0,
      paymentMethod,
      amountReceived:
        paymentMethod === 'CASH' && cashReceivedInput.trim()
          ? Number(cashReceivedInput.replace(/\D/g, ''))
          : undefined,
      staffRole: staffInfo.staffRole,
      catalog: flatCatalog,
    });
  }, [
    cartLines,
    discountType,
    parsedDiscountVal,
    discountReason,
    pointsToUse,
    linkedCustomer,
    paymentMethod,
    cashReceivedInput,
    staffInfo.staffRole,
    flatCatalog,
  ]);

  const { totals } = calculation;

  // Add item + size to cart
  const handleAddDrinkToCart = (item: MenuItem, sizeLabel: string, price: number) => {
    if (item.isAvailable === false) {
      setCheckoutError(`Món "${item.name}" hiện đang tạm hết hàng tại quầy.`);
      return;
    }
    setCheckoutError(null);
    const isBottled = sizeLabel === 'Chai';
    const defaultSweetness = isBottled ? 'Nguyên bản (Chai)' : '100% đường';
    const defaultIce = isBottled ? 'Ướp lạnh (Chai)' : '100% đá';

    setCartLines((prev) => {
      // Find matching line with identical size and default options
      const existingIndex = prev.findIndex(
        (l) =>
          l.itemId === item.id &&
          l.sizeLabel === sizeLabel &&
          l.sweetness === defaultSweetness &&
          l.ice === defaultIce &&
          l.addons.length === 0 &&
          l.itemNote === ''
      );

      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      }

      const newLine: PosCartLine = {
        lineId: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        itemId: item.id,
        productName: item.name,
        sizeLabel,
        basePrice: price,
        quantity: 1,
        sweetness: defaultSweetness,
        ice: defaultIce,
        addons: [],
        itemNote: '',
      };
      return [...prev, newLine];
    });
  };

  const handleUpdateQuantity = (lineId: string, delta: number) => {
    setCheckoutError(null);
    setCartLines((prev) =>
      prev
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0)
    );
    if (editingLineId === lineId) {
      const target = cartLines.find((l) => l.lineId === lineId);
      if (target && target.quantity + delta <= 0) {
        setEditingLineId(null);
      }
    }
  };

  const handleRemoveLine = (lineId: string) => {
    setCheckoutError(null);
    setCartLines((prev) => prev.filter((l) => l.lineId !== lineId));
    if (editingLineId === lineId) setEditingLineId(null);
  };

  const handleDuplicateLine = (lineId: string) => {
    setCheckoutError(null);
    const target = cartLines.find((l) => l.lineId === lineId);
    if (!target) return;
    const newLineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const cloned: PosCartLine = {
      ...target,
      lineId: newLineId,
      quantity: 1,
      addons: [...target.addons],
    };
    setCartLines((prev) => [...prev, cloned]);
    setEditingLineId(newLineId);
  };

  const handleRegisterNewMemberInline = async () => {
    const cleanPhone = customerPhoneInput.replace(/\D/g, '');
    if (cleanPhone.length < 9) {
      setCustomerLookupMsg('Vui lòng nhập SĐT hợp lệ (tối thiểu 9 số) trước khi tạo thành viên.');
      return;
    }
    const nameToUse = customerNameInput.trim() || `Thành viên ${cleanPhone.slice(-4)}`;
    setIsRegisteringCustomer(true);
    try {
      const res = await fetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: nameToUse,
          phone: cleanPhone,
        }),
      });
      const data = await res.json();
      if (data.customer) {
        setLinkedCustomer({
          id: data.customer.id,
          full_name: data.customer.full_name || nameToUse,
          phone: data.customer.phone || cleanPhone,
          point_balance: Number(data.customer.point_balance) || 0,
          tier_name: data.customer.tier?.name || 'Member',
          cashback_rate: Number(data.customer.tier?.cashback_rate) || 3,
        });
        setCustomerNameInput(data.customer.full_name || nameToUse);
        setCustomerLookupMsg(`✓ Đã đăng ký & liên kết thành viên: ${data.customer.full_name || nameToUse}`);
      } else {
        setCustomerLookupMsg(data.error || 'Không thể đăng ký thành viên lúc này.');
      }
    } catch {
      setCustomerLookupMsg('Lỗi kết nối khi tạo thành viên mới.');
    } finally {
      setIsRegisteringCustomer(false);
    }
  };

  const handleUpdateLineOption = (
    lineId: string,
    patch: Partial<Pick<PosCartLine, 'sizeLabel' | 'basePrice' | 'sweetness' | 'ice' | 'addons' | 'itemNote'>>
  ) => {
    setCartLines((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l))
    );
  };

  const handleToggleAddon = (lineId: string, addonId: string) => {
    setCartLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l;
        const exists = l.addons.includes(addonId);
        return {
          ...l,
          addons: exists ? l.addons.filter((id) => id !== addonId) : [...l.addons, addonId],
        };
      })
    );
  };

  const handleClearCart = () => {
    setCartLines([]);
    setEditingLineId(null);
    setDiscountType('NONE');
    setDiscountValue('');
    setDiscountReason('');
    setPointsToUse(0);
    setCashReceivedInput('');
    setOrderNote('');
    setCheckoutError(null);
    setIdempotencyKey(`pos-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  };

  const toggleOrderQuickNote = (chip: string) => {
    if (orderNote.includes(chip)) {
      const next = orderNote
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== chip)
        .join(', ');
      setOrderNote(next);
    } else {
      setOrderNote(orderNote.trim() ? `${orderNote.trim()}, ${chip}` : chip);
    }
  };

  // Lookup member by phone
  const handleLookupCustomer = useCallback(async (phoneOverride?: string) => {
    const rawPhone = phoneOverride !== undefined ? phoneOverride : customerPhoneInput;
    const clean = rawPhone.replace(/[\s\-()]/g, '');
    if (!clean) {
      setLinkedCustomer(null);
      setCustomerLookupMsg(null);
      setPointsToUse(0);
      return;
    }

    setLookingUpCustomer(true);
    setCustomerLookupMsg(null);
    try {
      const res = await fetch(`/api/user/by-phone?phone=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (data?.found && data?.user) {
        const rate = Number(data.user.tier?.cashback_rate) || 3;
        setLinkedCustomer({
          id: data.user.id,
          full_name: data.user.full_name || 'Thành viên Ủ LAB',
          phone: data.user.phone || clean,
          point_balance: Number(data.user.point_balance) || 0,
          tier_name: data.user.tier?.name || 'Member',
          cashback_rate: rate,
        });
        setCustomerNameInput((prev) => prev || data.user.full_name || '');
        setCustomerLookupMsg(
          `✓ Thành viên ${data.user.tier?.name || 'Member'} (Hoàn ${rate}%): ${data.user.full_name || clean} · Ví: ${formatVND(Number(data.user.point_balance) || 0)}`
        );
      } else {
        setLinkedCustomer(null);
        setPointsToUse(0);
        setCustomerLookupMsg('✨ SĐT mới: Hệ thống sẽ tự động tạo ví & tích điểm hoàn 3% ngay khi thanh toán!');
      }
    } catch {
      setCustomerLookupMsg('Không thể tra cứu SĐT lúc này.');
    } finally {
      setLookingUpCustomer(false);
    }
  }, [customerPhoneInput]);

  // Auto-lookup customer as soon as cashier types a 10-digit phone number
  useEffect(() => {
    const clean = customerPhoneInput.replace(/\D/g, '');
    if (clean.length === 10 && /^0\d{9}$/.test(clean)) {
      if (linkedCustomer?.phone !== clean) {
        handleLookupCustomer(clean);
      }
    } else if (clean.length === 0) {
      setLinkedCustomer(null);
      setCustomerLookupMsg(null);
      setPointsToUse(0);
    }
  }, [customerPhoneInput, linkedCustomer?.phone, handleLookupCustomer]);

  // Submit & Confirm POS Payment
  const handleConfirmPayment = async () => {
    setCheckoutError(null);

    if (cartLines.length === 0) {
      setCheckoutError('Vui lòng chọn ít nhất 1 món vào giỏ hàng trước khi thanh toán.');
      return;
    }

    // Validate discount reason if discount > 0
    if (discountType !== 'NONE' && parsedDiscountVal > 0 && discountReason.trim().length < 2) {
      setCheckoutError('Vui lòng nhập lý do giảm giá (bắt buộc để lưu nhật ký phân quyền).');
      return;
    }

    const exactCheck = calculatePosOrderTotals({
      items: cartLines.map((line) => ({
        itemId: line.itemId,
        productName: line.productName,
        sizeLabel: line.sizeLabel,
        quantity: line.quantity,
        unitPriceOverride: line.basePrice,
        options: {
          sweetness: line.sweetness,
          ice: line.ice,
          addons: line.addons,
        },
        itemNote: line.itemNote,
      })),
      discount:
        discountType !== 'NONE' && parsedDiscountVal > 0
          ? { type: discountType, value: parsedDiscountVal, reason: discountReason.trim() }
          : undefined,
      pointsRequested: pointsToUse,
      availableMemberPoints: linkedCustomer?.point_balance || 0,
      paymentMethod,
      amountReceived:
        paymentMethod === 'CASH' && cashReceivedInput.trim()
          ? Number(cashReceivedInput.replace(/\D/g, ''))
          : totals.totalDue,
      staffRole: staffInfo.staffRole,
      catalog: flatCatalog,
    });

    if (!exactCheck.validation.valid) {
      setCheckoutError(exactCheck.validation.error || 'Dữ liệu thanh toán chưa hợp lệ.');
      return;
    }

    setIsSubmittingOrder(true);
    try {
      const res = await fetch('/api/pos/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartLines.map((line) => ({
            itemId: line.itemId,
            productName: line.productName,
            sizeLabel: line.sizeLabel,
            quantity: line.quantity,
            unitPriceOverride: line.basePrice,
            options: {
              sweetness: line.sweetness,
              ice: line.ice,
              addons: line.addons,
            },
            itemNote: line.itemNote,
          })),
          orderType,
          paymentMethod,
          amountReceived:
            paymentMethod === 'CASH' && cashReceivedInput.trim()
              ? Number(cashReceivedInput.replace(/\D/g, ''))
              : exactCheck.totals.totalDue,
          discount:
            discountType !== 'NONE' && parsedDiscountVal > 0
              ? {
                type: discountType,
                value: parsedDiscountVal,
                reason: discountReason.trim(),
              }
              : undefined,
          customerPhone: customerPhoneInput.trim() || undefined,
          customerName: customerNameInput.trim() || linkedCustomer?.full_name || undefined,
          pointsUsed: pointsToUse,
          note: orderNote.trim() || undefined,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.order) {
        setCheckoutError(data.error || 'Không thể tạo đơn hàng. Vui lòng kiểm tra lại.');
        setIsSubmittingOrder(false);
        return;
      }

      const createdOrder: PosOrderRecord = data.order;

      // Generate QR Data URL if order has a qrTokenCode
      let qrUrl = '';
      if (createdOrder.qrTokenCode) {
        try {
          qrUrl = await QRCode.toDataURL(buildScanUrl(createdOrder.qrTokenCode), {
            width: 240,
            margin: 1,
            color: { dark: '#1E3932', light: '#FFFFFF' },
          });
        } catch {
          qrUrl = '';
        }
      }

      setCompletedOrder(createdOrder);
      setCompletedOrderQrDataUrl(qrUrl);
      setPreviewTab('receipt');

      // Reset cart for next customer
      handleClearCart();
      setCustomerPhoneInput('');
      setCustomerNameInput('');
      setLinkedCustomer(null);
      setCustomerLookupMsg(null);
      await fetchRecentOrders();
    } catch {
      setCheckoutError('Lỗi kết nối máy chủ khi xác nhận thanh toán.');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // Print Barista Ticket (Phiếu pha chế)
  const handlePrintBaristaTicket = (order: PosOrderRecord) => {
    const html = buildBaristaTicketHtml(order, staffInfo.locationName);
    const win = window.open('', '_blank', 'width=480,height=650');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  // Print Customer Receipt (Biên nhận)
  const handlePrintReceipt = async (order: PosOrderRecord, existingQrUrl?: string) => {
    let qrUrl = existingQrUrl || '';
    if (!qrUrl && order.qrTokenCode) {
      try {
        qrUrl = await QRCode.toDataURL(buildScanUrl(order.qrTokenCode), {
          width: 240,
          margin: 1,
          color: { dark: '#1E3932', light: '#FFFFFF' },
        });
      } catch {
        qrUrl = '';
      }
    }
    const html = buildCustomerReceiptHtml(order, qrUrl, staffInfo.locationName);
    const win = window.open('', '_blank', 'width=480,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  // Open order preview modal from recent orders list
  const handleOpenOrderPreview = async (order: PosOrderRecord, initialTab: 'receipt' | 'barista') => {
    let qrUrl = '';
    if (order.qrTokenCode) {
      try {
        qrUrl = await QRCode.toDataURL(buildScanUrl(order.qrTokenCode), {
          width: 240,
          margin: 1,
          color: { dark: '#1E3932', light: '#FFFFFF' },
        });
      } catch {
        qrUrl = '';
      }
    }
    setCompletedOrder(order);
    setCompletedOrderQrDataUrl(qrUrl);
    setPreviewTab(initialTab);
  };

  // Cancel Order with Role Permission & Audit Reason
  const handleConfirmCancelOrder = async () => {
    if (!cancellingOrder) return;
    setCancelError(null);

    if (cancelReasonInput.trim().length < 3) {
      setCancelError('Vui lòng nhập lý do hủy đơn (tối thiểu 3 ký tự).');
      return;
    }

    setIsCancelling(true);
    try {
      const res = await fetch(`/api/pos/orders/${cancellingOrder.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReasonInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCancelError(data.error || 'Không thể hủy đơn hàng này.');
        setIsCancelling(false);
        return;
      }

      setCancellingOrder(null);
      setCancelReasonInput('');
      await fetchRecentOrders();
    } catch {
      setCancelError('Lỗi kết nối khi thực hiện hủy đơn.');
    } finally {
      setIsCancelling(false);
    }
  };

  // ── Legacy QR Generator Handlers ──
  const fetchDBTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      if (searchCode.trim()) params.set('search', searchCode.trim());
      params.set('_t', Date.now().toString());

      const res = await fetch(`/api/admin/qr?${params.toString()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setDbTokens(data.tokens || []);
        if (data.stats) setDbStats(data.stats);
      }
    } catch (err) {
      console.error('Fetch QR tokens error:', err);
    } finally {
      setLoadingTokens(false);
    }
  }, [statusFilter, searchCode]);

  useEffect(() => {
    if (activeMode !== 'qr') return;
    let isMounted = true;
    (async () => {
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'ALL') params.set('status', statusFilter);
        if (searchCode.trim()) params.set('search', searchCode.trim());
        params.set('_t', Date.now().toString());

        const res = await fetch(`/api/admin/qr?${params.toString()}`, { cache: 'no-store' });
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setDbTokens(data.tokens || []);
          if (data.stats) setDbStats(data.stats);
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setLoadingTokens(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [activeMode, statusFilter, searchCode]);

  const generateQR = async (price: number, label?: string) => {
    if (!price || price <= 0) return;
    setIsGenerating(true);
    try {
      let code = `QR-${price}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      try {
        const res = await fetch('/api/qr/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drink_value: price, custom_code: code }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code) code = data.code;
        }
      } catch {
        // ignore
      }
      const scanUrl = buildScanUrl(code);
      const qrDataUrl = await QRCode.toDataURL(scanUrl, {
        width: 340,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      });
      setCurrentQR({
        code,
        price,
        label,
        qrDataUrl,
        scanUrl,
        createdAt: new Date().toLocaleTimeString('vi-VN'),
      });
      fetchDBTokens();
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrintSingleQR = async (
    qrCode: string,
    price: number,
    existingDataUrl?: string,
    drinkLabel?: string
  ) => {
    const scanUrl = buildScanUrl(qrCode);
    const dataUrl =
      existingDataUrl ||
      (await QRCode.toDataURL(scanUrl, {
        width: 360,
        margin: 2,
        color: { dark: '#1E3932', light: '#FFFFFF' },
      }));

    const printWindow = window.open('', '_blank', 'width=450,height=600');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>In Tem QR 75x100mm - Ủ LAB</title>
        <style>
          @page { size: 75mm 100mm; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 75mm; height: 100mm; overflow: hidden; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 4mm; text-align: center; color: #1E3932; background: #FFFFFF;
          }
          .brand { font-size: 13pt; font-weight: 800; letter-spacing: 0.08em; margin-bottom: 2mm; }
          .label { font-size: 10pt; font-weight: 700; color: #006241; margin-bottom: 1.5mm; max-width: 67mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .qr { width: 48mm; height: 48mm; margin: 2mm 0; display: block; }
          .price { font-size: 15pt; font-weight: 800; margin-top: 1mm; }
          .hint { font-size: 8.5pt; font-weight: 600; color: #333; margin-top: 1.5mm; }
          .code { font-size: 7.5pt; font-family: monospace; color: #555; margin-top: 1.5mm; }
        </style>
      </head>
      <body>
        <div class="brand">Ủ LAB · TÍCH ĐIỂM</div>
        ${drinkLabel ? `<div class="label">${drinkLabel}</div>` : ''}
        <img class="qr" src="${dataUrl}" alt="QR" />
        <div class="price">${formatVND(price)}</div>
        <div class="hint">Mở Camera ĐT quét nhận hoàn điểm 3-10%</div>
        <div class="code">${qrCode}</div>
        <script>
          window.onload = () => { window.focus(); window.print(); window.close(); };
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className={styles.panel}>
      {/* Top Header & Mode Switcher */}
      <div className={styles.topHeaderBar}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>M01 — POS Bán Hàng Tại Quầy</h1>
            <span className={styles.locationBadge}>{staffInfo.locationName}</span>
            <span className={styles.roleBadge}>
              NV: {staffInfo.fullName} ({staffInfo.staffRole})
            </span>
          </div>
          <p className={styles.subtitle}>
            Chọn món, tùy chỉnh size/đường/đá/topping, áp dụng giảm giá theo quyền, thanh toán và in phiếu pha chế + biên nhận ngay tại quầy.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {recentOrders.length > 0 && (
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => handleOpenOrderPreview(recentOrders[0], 'receipt')}
              title="Mở nhanh phiếu pha chế và biên nhận của đơn vừa tạo gần nhất"
              style={{ fontWeight: 700, borderColor: '#006241', color: '#006241' }}
            >
              🖨️ In lại đơn vừa tạo (#{recentOrders[0].orderCode})
            </button>
          )}
          <div className={styles.modeSwitchGroup} role="tablist" aria-label="Chế độ vận hành POS">
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'pos'}
              className={`${styles.modeSwitchBtn} ${activeMode === 'pos' ? styles.modeSwitchActive : ''}`}
              onClick={() => setActiveMode('pos')}
            >
              🛒 Bán hàng POS
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeMode === 'qr'}
              className={`${styles.modeSwitchBtn} ${activeMode === 'qr' ? styles.modeSwitchActive : ''}`}
              onClick={() => setActiveMode('qr')}
            >
              📱 Tích / Trừ Điểm SĐT Tại Quầy
            </button>
          </div>
        </div>
      </div>

      {activeMode === 'pos' ? (
        <>
          {/* ══════════════════════════════════════════════════════════════
              PRIMARY POS COUNTER WORKSPACE (2 COLUMNS)
             ══════════════════════════════════════════════════════════════ */}
          <div className={styles.posWorkspaceGrid}>
            {/* LEFT COLUMN: MENU CATALOG */}
            <div className={styles.leftCol}>
              <div className={styles.cardBox}>
                {/* Category Filter Pills & Search */}
                <div className={styles.menuFilterBar}>
                  <div className={styles.catFilterPills}>
                    <button
                      type="button"
                      className={`${styles.catPill} ${selectedCategorySlug === 'all' ? styles.catPillActive : ''}`}
                      onClick={() => setSelectedCategorySlug('all')}
                    >
                      Tất cả ({flatCatalog.length})
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat.slug}
                        type="button"
                        className={`${styles.catPill} ${selectedCategorySlug === cat.slug ? styles.catPillActive : ''}`}
                        onClick={() => setSelectedCategorySlug(cat.slug)}
                      >
                        {cat.icon} {cat.name} ({cat.items.length})
                      </button>
                    ))}
                  </div>

                  <div className={styles.menuSearchWrap}>
                    <input
                      type="search"
                      placeholder="🔍 Tìm nhanh tên món..."
                      value={menuSearch}
                      onChange={(e) => setMenuSearch(e.target.value)}
                      className={styles.menuSearchInput}
                      aria-label="Tìm kiếm món trong menu"
                    />
                  </div>
                </div>

                {menuError && (
                  <div className={styles.noticeBanner} role="status">
                    <span>ℹ️ {menuError}</span>
                  </div>
                )}

                {loadingMenu ? (
                  <div className={styles.stateBox}>Đang tải danh mục thực đơn POS...</div>
                ) : displayedCategories.length === 0 ? (
                  <div className={styles.stateBox}>
                    Không tìm thấy món nào khớp với từ khóa &ldquo;{menuSearch}&rdquo;.
                  </div>
                ) : (
                  <div className={styles.categorySections}>
                    {displayedCategories.map((cat) => (
                      <div key={cat.slug} className={styles.categoryGroup}>
                        <div className={styles.categoryGroupHeader}>
                          <span>
                            {cat.icon} {cat.name}
                          </span>
                        </div>
                        <div className={styles.menuDrinkGrid}>
                          {cat.items.map((item) => {
                            const isOut = item.isAvailable === false;
                            return (
                              <div
                                key={item.id}
                                className={`${styles.posDrinkCard} ${isOut ? styles.posDrinkCardOut : ''}`}
                              >
                                <div className={styles.posDrinkTop}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {item.imageUrl && (
                                      <img
                                        src={item.imageUrl}
                                        alt={item.name}
                                        style={{
                                          width: 36,
                                          height: 36,
                                          borderRadius: 8,
                                          objectFit: 'cover',
                                          flexShrink: 0,
                                          border: '1px solid rgba(0,0,0,0.06)',
                                        }}
                                      />
                                    )}
                                    <span className={styles.posDrinkName}>{item.name}</span>
                                  </div>
                                  {item.isSignature && (
                                    <span className={styles.sigTag}>
                                      ★ {item.badgeLabel || 'Signature'}
                                    </span>
                                  )}
                                  {isOut && (
                                    <span className={styles.outTag}>Hết hàng</span>
                                  )}
                                </div>
                                {(item.description || item.shelfLife) && (
                                  <span className={styles.shelfLifeHint}>
                                    {item.description || item.shelfLife}
                                  </span>
                                )}
                                <div className={styles.posDrinkSizes}>
                                  {item.sizes.map((sz) => (
                                    <button
                                      key={sz.label}
                                      type="button"
                                      disabled={isOut}
                                      className={`${styles.posSizeBtn} ${isOut ? styles.posSizeBtnDisabled : ''}`}
                                      onClick={() => {
                                        if (isOut) return;
                                        handleAddDrinkToCart(item, sz.label, sz.price);
                                      }}
                                      aria-label={`Thêm ${item.name} size ${sz.label} giá ${formatVND(sz.price)}`}
                                    >
                                      <span className={styles.posSizeLabel}>
                                        {sz.label === 'Chai' ? 'Chai' : `Size ${sz.label}`}
                                      </span>
                                      <span className={styles.posSizePrice}>
                                        {isOut ? 'Tạm hết' : `+${formatVND(sz.price)}`}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* RIGHT COLUMN: STICKY CART, OPTIONS, DISCOUNT & CHECKOUT */}
            <div className={styles.rightCol}>
              <div className={styles.checkoutCard}>
                {/* Order Type Selector & Clear Cart */}
                <div className={styles.cartHeaderBar}>
                  <div className={styles.orderTypeToggle} role="group" aria-label="Hình thức đơn hàng">
                    <button
                      type="button"
                      className={`${styles.orderTypeBtn} ${orderType === 'TAKEAWAY' ? styles.orderTypeActive : ''}`}
                      onClick={() => setOrderType('TAKEAWAY')}
                    >
                      🛍️ Mang đi
                    </button>
                    <button
                      type="button"
                      className={`${styles.orderTypeBtn} ${orderType === 'DINE_IN' ? styles.orderTypeActive : ''}`}
                      onClick={() => setOrderType('DINE_IN')}
                    >
                      ☕ Tại quán
                    </button>
                  </div>

                  {cartLines.length > 0 && (
                    <button
                      type="button"
                      className={styles.clearCartTextBtn}
                      onClick={handleClearCart}
                    >
                      Xóa giỏ ({totals.totalQuantity})
                    </button>
                  )}
                </div>

                {/* Cart Items List */}
                {cartLines.length === 0 ? (
                  <div className={styles.emptyCartBox}>
                    <div className={styles.emptyCartIcon}>🧋</div>
                    <strong>Giỏ hàng quầy đang trống</strong>
                    <p>Bấm vào nút Size (M / L / Chai) của món bên trái để thêm nhanh vào đơn.</p>
                  </div>
                ) : (
                  <div className={styles.cartItemsList}>
                    {cartLines.map((line, idx) => {
                      const normalized = totals.items[idx];
                      const lineUnitPrice = normalized ? normalized.unitPrice : line.basePrice;
                      const lineSubtotal = normalized
                        ? normalized.subtotal
                        : line.basePrice * line.quantity;
                      const isEditing = editingLineId === line.lineId;
                      const isBottled = line.sizeLabel === 'Chai';
                      const catalogItem = flatCatalog.find((m) => m.id === line.itemId);

                      const summaryText = formatItemOptionsSummary(
                        normalized?.options,
                        line.itemNote
                      );

                      return (
                        <div key={line.lineId} className={styles.cartLineCard}>
                          <div className={styles.cartLineMain}>
                            <div className={styles.cartLineInfo}>
                              <div className={styles.cartLineTitleRow}>
                                <span className={styles.cartLineName}>{line.productName}</span>
                                <span className={styles.cartLineSizeBadge}>
                                  {line.sizeLabel === 'Chai' ? 'Chai' : `Size ${line.sizeLabel}`}
                                </span>
                              </div>
                              <div className={styles.cartLineOptSummary}>
                                {summaryText || '100% đường · 100% đá'}
                              </div>
                            </div>

                            <div className={styles.cartLineControls}>
                              <div className={styles.qtyStepper}>
                                <button
                                  type="button"
                                  className={styles.qtyStepBtn}
                                  onClick={() => handleUpdateQuantity(line.lineId, -1)}
                                  aria-label="Giảm số lượng"
                                >
                                  −
                                </button>
                                <span className={styles.qtyStepVal}>{line.quantity}</span>
                                <button
                                  type="button"
                                  className={styles.qtyStepBtn}
                                  onClick={() => handleUpdateQuantity(line.lineId, 1)}
                                  aria-label="Tăng số lượng"
                                >
                                  +
                                </button>
                              </div>
                              <span className={styles.cartLinePrice}>
                                {formatVND(lineSubtotal)}
                              </span>
                            </div>
                          </div>

                          <div className={styles.cartLineFooterActions}>
                            <button
                              type="button"
                              className={styles.lineEditToggleBtn}
                              onClick={() =>
                                setEditingLineId(isEditing ? null : line.lineId)
                              }
                            >
                              {isEditing
                                ? '▲ Đóng tùy chọn'
                                : '⚙️ Tùy chọn (Size / Đường / Đá / Topping / Ghi chú)'}
                            </button>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button
                                type="button"
                                className={styles.lineEditToggleBtn}
                                onClick={() => handleDuplicateLine(line.lineId)}
                                title="Nhân bản thêm 1 dòng món giống hệt để chỉnh riêng đá/đường"
                              >
                                📋 Nhân bản
                              </button>
                              <button
                                type="button"
                                className={styles.lineRemoveBtn}
                                onClick={() => handleRemoveLine(line.lineId)}
                              >
                                Xóa
                              </button>
                            </div>
                          </div>

                          {/* Expandable Item Options Drawer */}
                          {isEditing && (
                            <div className={styles.itemOptionsPanel}>
                              {/* Size switcher if item has multiple sizes */}
                              {catalogItem && catalogItem.sizes.length > 1 && (
                                <div className={styles.optRow}>
                                  <span className={styles.optLabel}>Đổi Size:</span>
                                  <div className={styles.optChips}>
                                    {catalogItem.sizes.map((sz) => (
                                      <button
                                        key={sz.label}
                                        type="button"
                                        className={`${styles.optChip} ${line.sizeLabel === sz.label ? styles.optChipActive : ''}`}
                                        onClick={() =>
                                          handleUpdateLineOption(line.lineId, {
                                            sizeLabel: sz.label,
                                            basePrice: sz.price,
                                          })
                                        }
                                      >
                                        Size {sz.label} ({formatVND(sz.price)})
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {!isBottled && (
                                <>
                                  <div className={styles.optRow}>
                                    <span className={styles.optLabel}>Độ ngọt:</span>
                                    <div className={styles.optChips}>
                                      {SWEETNESS_OPTIONS.map((sw) => (
                                        <button
                                          key={sw}
                                          type="button"
                                          className={`${styles.optChip} ${line.sweetness === sw ? styles.optChipActive : ''}`}
                                          onClick={() =>
                                            handleUpdateLineOption(line.lineId, {
                                              sweetness: sw,
                                            })
                                          }
                                        >
                                          {sw}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className={styles.optRow}>
                                    <span className={styles.optLabel}>Mức đá:</span>
                                    <div className={styles.optChips}>
                                      {ICE_OPTIONS.map((ic) => (
                                        <button
                                          key={ic}
                                          type="button"
                                          className={`${styles.optChip} ${line.ice === ic ? styles.optChipActive : ''}`}
                                          onClick={() =>
                                            handleUpdateLineOption(line.lineId, {
                                              ice: ic,
                                            })
                                          }
                                        >
                                          {ic}
                                        </button>
                                      ))}
                                    </div>
                                  </div>

                                  <div className={styles.optRow}>
                                    <span className={styles.optLabel}>Thêm / Đổi Sữa:</span>
                                    <div className={styles.optChips}>
                                      {ADDON_OPTIONS.filter((addon) => {
                                        if (addon.id === '1g-matcha-fuji') {
                                          const slug = (catalogItem?.categorySlug || '').toLowerCase();
                                          const cat = (catalogItem?.category || '').toLowerCase();
                                          const name = (line.productName || '').toLowerCase();
                                          return slug === 'matcha' || cat.includes('matcha') || name.includes('matcha');
                                        }
                                        return true;
                                      }).map((addon) => {
                                        const selected = line.addons.includes(addon.id);
                                        return (
                                          <button
                                            key={addon.id}
                                            type="button"
                                            className={`${styles.optChip} ${selected ? styles.optChipActive : ''}`}
                                            onClick={() =>
                                              handleToggleAddon(line.lineId, addon.id)
                                            }
                                          >
                                            {selected ? '✓ ' : '+ '}
                                            {addon.name}{' '}
                                            {addon.price > 0
                                              ? `(+${formatVND(addon.price)})`
                                              : '(Miễn phí)'}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </>
                              )}

                              <div className={styles.optRow}>
                                <input
                                  type="text"
                                  placeholder="Ghi chú riêng cho ly này (VD: Khuấy đều, viết lời chúc)..."
                                  value={line.itemNote}
                                  onChange={(e) =>
                                    handleUpdateLineOption(line.lineId, {
                                      itemNote: e.target.value,
                                    })
                                  }
                                  className={styles.lineNoteInput}
                                />
                              </div>
                              <div className={styles.optUnitSummary}>
                                Đơn giá sau tùy chọn: <strong>{formatVND(lineUnitPrice)} / ly</strong>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Order Note & Quick Chips */}
                <div className={styles.checkoutSection}>
                  <label className={styles.fieldLabel}>Ghi chú đơn hàng / Pha chế</label>
                  <input
                    type="text"
                    placeholder="Ghi chú chung cho đơn hàng..."
                    value={orderNote}
                    onChange={(e) => setOrderNote(e.target.value)}
                    className={styles.compactInput}
                  />
                  <div className={styles.quickNoteChips}>
                    {ORDER_QUICK_NOTES.map((chip) => {
                      const active = orderNote.includes(chip);
                      return (
                        <button
                          key={chip}
                          type="button"
                          className={`${styles.miniChip} ${active ? styles.miniChipActive : ''}`}
                          onClick={() => toggleOrderQuickNote(chip)}
                        >
                          {active ? `✓ ${chip}` : `+ ${chip}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Customer Lookup & Loyalty Redemption */}
                <div className={styles.checkoutSection}>
                  <label className={styles.fieldLabel}>
                    📱 Đọc SĐT Tích / Trừ Điểm Tại Quầy (Cộng 3%–10% theo hạng thẻ)
                  </label>
                  <div className={styles.customerLookupRow}>
                    <input
                      type="tel"
                      placeholder="Nhập SĐT khách đọc tại quầy..."
                      value={customerPhoneInput}
                      onChange={(e) => setCustomerPhoneInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleLookupCustomer();
                        }
                      }}
                      className={styles.compactInput}
                    />
                    <button
                      type="button"
                      className={styles.lookupBtn}
                      onClick={() => handleLookupCustomer()}
                      disabled={lookingUpCustomer}
                    >
                      {lookingUpCustomer ? '...' : 'Tra cứu'}
                    </button>
                    <input
                      type="text"
                      placeholder="Tên khách..."
                      value={customerNameInput}
                      onChange={(e) => setCustomerNameInput(e.target.value)}
                      className={styles.compactInput}
                    />
                  </div>
                  {customerLookupMsg && (
                    <div
                      className={styles.customerLookupStatus}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      <span>{customerLookupMsg}</span>
                      {!linkedCustomer && customerPhoneInput.replace(/\D/g, '').length >= 9 && (
                        <button
                          type="button"
                          className={styles.miniChip}
                          disabled={isRegisteringCustomer}
                          onClick={handleRegisterNewMemberInline}
                          style={{ background: '#006241', color: '#fff', borderColor: '#006241', fontWeight: 700 }}
                        >
                          {isRegisteringCustomer ? 'Đang tạo...' : '+ Đăng ký thành viên mới'}
                        </button>
                      )}
                    </div>
                  )}
                  {linkedCustomer && linkedCustomer.point_balance > 0 && (
                    <div className={styles.pointsRedeemRow} style={{ flexWrap: 'wrap', gap: 6 }}>
                      <span>Trừ tại quầy (Ví: {formatVND(linkedCustomer.point_balance)}):</span>
                      <div className={styles.pointsRedeemControls} style={{ flexWrap: 'wrap' }}>
                        <input
                          type="number"
                          min={0}
                          max={Math.min(linkedCustomer.point_balance, totals.subtotal)}
                          step={1000}
                          value={pointsToUse || ''}
                          onChange={(e) =>
                            setPointsToUse(
                              Math.min(
                                Math.max(0, Number(e.target.value) || 0),
                                linkedCustomer.point_balance,
                                totals.subtotal
                              )
                            )
                          }
                          placeholder="0"
                          className={styles.pointsSmallInput}
                        />
                        {[10000, 20000]
                          .filter((v) => v <= Math.min(linkedCustomer.point_balance, totals.subtotal))
                          .map((v) => (
                            <button
                              key={v}
                              type="button"
                              className={styles.miniChip}
                              onClick={() => setPointsToUse(v)}
                            >
                              -{formatVND(v)}
                            </button>
                          ))}
                        <button
                          type="button"
                          className={styles.miniChip}
                          onClick={() =>
                            setPointsToUse(
                              Math.min(linkedCustomer.point_balance, totals.subtotal)
                            )
                          }
                        >
                          Trừ tối đa
                        </button>
                        {pointsToUse > 0 && (
                          <button
                            type="button"
                            className={styles.miniChip}
                            onClick={() => setPointsToUse(0)}
                          >
                            Bỏ trừ
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {/^0\d{8,10}$/.test(customerPhoneInput.replace(/\D/g, '')) &&
                    (totals.pointsUsed > 0 ? (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '7px 10px',
                          borderRadius: 8,
                          background: '#fffbeb',
                          border: '1px solid #fde68a',
                          color: '#92400e',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          ⚠️ Đơn có trừ tiền tại quầy (−{formatVND(totals.pointsUsed)}) → Không cộng tích điểm mới (0đ)
                        </span>
                      </div>
                    ) : totals.totalDue > 0 ? (
                      <div
                        style={{
                          marginTop: 6,
                          padding: '7px 10px',
                          borderRadius: 8,
                          background: '#ecfdf5',
                          border: '1px solid #a7f3d0',
                          color: '#065f46',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span>
                          🎁 Cộng theo hạng {linkedCustomer?.tier_name || 'Member'} (+{linkedCustomer?.cashback_rate || 3}%):
                        </span>
                        <strong>
                          +{formatVND(Math.floor((totals.totalDue * (linkedCustomer?.cashback_rate || 3)) / 100))} vào ví khách
                        </strong>
                      </div>
                    ) : null)}
                </div>

                {/* Role-Based Discount Section */}
                <div className={styles.checkoutSection}>
                  <div className={styles.sectionHeaderRow}>
                    <label className={styles.fieldLabel}>Giảm giá (Phân quyền: {staffInfo.staffRole})</label>
                    <span className={styles.roleLimitHint}>
                      {staffInfo.staffRole === 'CASHIER'
                        ? `Tối đa ${CASHIER_MAX_DISCOUNT_PERCENT}% (${formatVND(CASHIER_MAX_DISCOUNT_AMOUNT)})`
                        : 'Quản lý/Admin: tối đa 100%'}
                    </span>
                  </div>

                  <div className={styles.discountModeRow}>
                    {(
                      [
                        { key: 'NONE', label: 'Không giảm' },
                        { key: 'PERCENT', label: 'Giảm %' },
                        { key: 'FIXED', label: 'Giảm tiền (đ)' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        className={`${styles.discountTypeBtn} ${discountType === m.key ? styles.discountTypeActive : ''}`}
                        onClick={() => {
                          setDiscountType(m.key);
                          if (m.key === 'NONE') {
                            setDiscountValue('');
                            setDiscountReason('');
                          }
                        }}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  {discountType !== 'NONE' && (
                    <div className={styles.discountInputsBox}>
                      <div className={styles.discountQuickRow}>
                        {discountType === 'PERCENT' ? (
                          <>
                            {[5, 10, 15, 20, 50].map((pct) => (
                              <button
                                key={pct}
                                type="button"
                                className={styles.miniChip}
                                onClick={() => {
                                  setDiscountValue(String(pct));
                                  if (!discountReason) setDiscountReason(`Ưu đãi giảm ${pct}%`);
                                }}
                              >
                                {pct}%
                              </button>
                            ))}
                          </>
                        ) : (
                          <>
                            {[5000, 10000, 15000, 20000, 30000].map((amt) => (
                              <button
                                key={amt}
                                type="button"
                                className={styles.miniChip}
                                onClick={() => {
                                  setDiscountValue(String(amt));
                                  if (!discountReason)
                                    setDiscountReason(`Voucher giảm ${formatVND(amt)}`);
                                }}
                              >
                                -{formatVND(amt)}
                              </button>
                            ))}
                          </>
                        )}
                      </div>

                      <div className={styles.discountInputPair}>
                        <input
                          type="number"
                          placeholder={
                            discountType === 'PERCENT' ? 'Nhập % (VD: 10)' : 'Nhập số tiền (VD: 15000)'
                          }
                          value={discountValue}
                          onChange={(e) => setDiscountValue(e.target.value)}
                          className={styles.compactInput}
                        />
                        <input
                          type="text"
                          placeholder="Lý do giảm giá (bắt buộc) *"
                          value={discountReason}
                          onChange={(e) => setDiscountReason(e.target.value)}
                          className={styles.compactInput}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Unified Money Account & Cash Tender */}
                <div className={styles.checkoutSection}>
                  <label className={styles.fieldLabel}>Tài khoản thanh toán</label>
                  <div className={styles.paymentMethodGrid}>
                    <button
                      type="button"
                      className={`${styles.paymentMethodBtn} ${styles.paymentMethodActive}`}
                      onClick={() => setPaymentMethod('CASH')}
                      style={{ gridColumn: '1 / -1' }}
                    >
                      💵 Tiền (Quỹ Tiền Cửa Hàng)
                    </button>
                  </div>

                  {totals.totalDue > 0 && (
                    <div className={styles.cashTenderBox}>
                      <div className={styles.cashTenderInputRow}>
                        <span>Khách đưa:</span>
                        <input
                          type="number"
                          placeholder={String(totals.totalDue)}
                          value={cashReceivedInput}
                          onChange={(e) => setCashReceivedInput(e.target.value)}
                          className={styles.compactInput}
                        />
                      </div>
                      <div className={styles.cashQuickRow}>
                        <button
                          type="button"
                          className={styles.miniChip}
                          onClick={() => setCashReceivedInput(String(totals.totalDue))}
                        >
                          Đúng {formatVND(totals.totalDue)}
                        </button>
                        {[50000, 100000, 200000, 500000]
                          .filter((v) => v >= totals.totalDue)
                          .map((v) => (
                            <button
                              key={v}
                              type="button"
                              className={styles.miniChip}
                              onClick={() => setCashReceivedInput(String(v))}
                            >
                              {formatVND(v)}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Totals Breakdown */}
                <div className={styles.totalsSummaryBox}>
                  <div className={styles.sumRow}>
                    <span>Tạm tính ({totals.totalQuantity} món)</span>
                    <span>{formatVND(totals.subtotal)}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className={`${styles.sumRow} ${styles.sumDiscount}`}>
                      <span>Giảm giá ({totals.discountPercent}%)</span>
                      <span>−{formatVND(totals.discountAmount)}</span>
                    </div>
                  )}
                  {totals.pointsUsed > 0 && (
                    <div className={`${styles.sumRow} ${styles.sumDiscount}`}>
                      <span>Trừ điểm thành viên</span>
                      <span>−{formatVND(totals.pointsUsed)}</span>
                    </div>
                  )}
                  <div className={styles.sumTotalRow}>
                    <span>KHÁCH CẦN THANH TOÁN</span>
                    <span>{formatVND(totals.totalDue)}</span>
                  </div>
                  {paymentMethod === 'CASH' && totals.totalDue > 0 && (
                    <div className={styles.sumChangeRow}>
                      <span>Tiền thừa trả khách</span>
                      <strong>{formatVND(totals.changeDue)}</strong>
                    </div>
                  )}
                </div>

                {checkoutError && (
                  <div className={styles.errorAlert} role="alert">
                    ⚠️ {checkoutError}
                  </div>
                )}

                <button
                  type="button"
                  className={styles.payNowBtn}
                  disabled={isSubmittingOrder || cartLines.length === 0}
                  onClick={handleConfirmPayment}
                  id="pos-confirm-payment-btn"
                >
                  {isSubmittingOrder ? (
                    <span>Đang xử lý đơn hàng...</span>
                  ) : (
                    <span>✓ XÁC NHẬN THANH TOÁN · {formatVND(totals.totalDue)}</span>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════
              RECENT POS ORDERS LOOKUP, REPRINT & ROLE-BASED CANCELLATION (COLLAPSIBLE)
             ══════════════════════════════════════════════════════════════ */}
          <div className={styles.recentOrdersSection}>
            <div className={styles.tableHeaderBar}>
              <div>
                <h2 className={styles.sectionTitle}>
                  Tra Cứu Nhanh Đơn Hàng Tại Quầy ({recentOrders.length} đơn gần nhất)
                </h2>
                <p className={styles.sectionSubDesc}>
                  Đã thu gọn mặc định để màn hình POS gọn gàng. Quản lý đầy đủ đơn hàng tại tab <strong>Đơn Hàng</strong>.
                </p>
              </div>

              <div className={styles.tableFilterActions}>
                <button
                  type="button"
                  onClick={() => setShowRecentOrdersTable((prev) => !prev)}
                  className={styles.refreshBtn}
                  style={{ fontWeight: 700, background: showRecentOrdersTable ? '#1e3932' : '#ffffff', color: showRecentOrdersTable ? '#ffffff' : '#1e3932' }}
                >
                  {showRecentOrdersTable ? '▲ Thu gọn danh sách đơn' : `▼ Mở danh sách (${recentOrders.length} đơn)`}
                </button>
              </div>
            </div>

            {showRecentOrdersTable && (
              <>
                <div className={styles.tableFilterActions} style={{ marginBottom: 12 }}>
                  <input
                    type="date"
                    value={ordersDate}
                    onChange={(e) => setOrdersDate(e.target.value)}
                    className={styles.filterSelect}
                    aria-label="Lọc theo ngày"
                  />

                  <select
                    value={ordersFilterStatus}
                    onChange={(e) => setOrdersFilterStatus(e.target.value)}
                    className={styles.filterSelect}
                    aria-label="Lọc theo trạng thái đơn"
                  >
                    <option value="ALL">Tất cả trạng thái</option>
                    <option value="CONFIRMED">Đã thanh toán (CONFIRMED)</option>
                    <option value="PENDING">Chờ xác nhận (PENDING)</option>
                    <option value="CANCELLED">Đã hủy (CANCELLED)</option>
                  </select>

                  <input
                    type="search"
                    placeholder="Tìm mã đơn (#POS-...), tên, SĐT..."
                    value={ordersSearch}
                    onChange={(e) => setOrdersSearch(e.target.value)}
                    className={styles.searchInput}
                  />

                  <button
                    type="button"
                    onClick={fetchRecentOrders}
                    className={styles.refreshBtn}
                  >
                    ↻ Làm mới
                  </button>
                </div>

                <div className={styles.tableCard}>
              {loadingOrders ? (
                <div className={styles.tableEmpty}>Đang tải danh sách đơn hàng gần đây...</div>
              ) : recentOrders.length === 0 ? (
                <div className={styles.tableEmpty}>
                  Chưa có đơn hàng nào khớp với bộ lọc hiện tại.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className={styles.qrTable}>
                    <thead>
                      <tr>
                        <th>Mã đơn &amp; Thời gian</th>
                        <th>Khách hàng &amp; Hình thức</th>
                        <th>Chi tiết món</th>
                        <th>Thanh toán</th>
                        <th>Trạng thái</th>
                        <th style={{ textAlign: 'right' }}>Phiếu in &amp; Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((ord) => {
                        const isCancelled = ord.status === 'CANCELLED';
                        return (
                          <tr key={ord.id}>
                            <td>
                              <div className={styles.codeCell}>
                                <span className={styles.codeMono}>#{ord.orderCode}</span>
                                <span className={styles.dateCell}>
                                  {new Date(ord.createdAt).toLocaleString('vi-VN', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: '2-digit',
                                    month: '2-digit',
                                  })}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.scannerCell}>
                                <strong>{ord.customerName}</strong>
                                <span>
                                  {ord.orderType === 'TAKEAWAY'
                                    ? '🛍️ Mang đi'
                                    : ord.orderType === 'DINE_IN'
                                      ? '☕ Tại quán'
                                      : '🛵 Giao hàng'}
                                  {ord.customerPhone ? ` · ${ord.customerPhone}` : ''}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className={styles.orderItemsCell}>
                                {ord.items.map((it, idx) => (
                                  <div key={idx} className={styles.orderItemMiniLine}>
                                    <strong>
                                      {it.quantity}× {it.productName} ({it.sizeLabel})
                                    </strong>
                                    {it.optionsSummary && (
                                      <span className={styles.orderItemMiniOpt}>
                                        {' '}
                                        — {it.optionsSummary}
                                      </span>
                                    )}
                                  </div>
                                ))}
                                {ord.note && (
                                  <div className={styles.orderNoteMini}>📝 {ord.note}</div>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className={styles.codeCell}>
                                <span className={styles.priceCell}>
                                  {formatVND(ord.totalDue)}
                                </span>
                                {ord.discountAmount > 0 && (
                                  <span className={styles.discountMiniTag}>
                                    Giảm: -{formatVND(ord.discountAmount)}
                                  </span>
                                )}
                                <span className={styles.codeSubLink}>
                                  💵 Tiền
                                </span>
                              </div>
                            </td>
                            <td>
                              {isCancelled ? (
                                <div>
                                  <span className={styles.badgeCancelled}>Đã hủy</span>
                                  {ord.cancelReason && (
                                    <div className={styles.cancelReasonText}>
                                      Lý do: {ord.cancelReason}
                                    </div>
                                  )}
                                </div>
                              ) : ord.status === 'PENDING' ? (
                                <span className={styles.badgeUsed}>Chờ xác nhận</span>
                              ) : (
                                <span className={styles.badgeActive}>Đã thanh toán</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className={styles.rowActions}>
                                <button
                                  type="button"
                                  className={styles.rowBtn}
                                  onClick={() => handleOpenOrderPreview(ord, 'barista')}
                                >
                                  🏷️ Phiếu pha chế
                                </button>
                                <button
                                  type="button"
                                  className={styles.rowBtn}
                                  onClick={() => handleOpenOrderPreview(ord, 'receipt')}
                                >
                                  🧾 Biên nhận
                                </button>
                                {!isCancelled && (
                                  <button
                                    type="button"
                                    className={styles.rowDeleteBtn}
                                    onClick={() => {
                                      setCancellingOrder(ord);
                                      setCancelReasonInput('');
                                      setCancelError(null);
                                    }}
                                  >
                                    Hủy đơn
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </>
      ) : (
        /* ══════════════════════════════════════════════════════════════
            COUNTER PHONE LOYALTY (TRA CỨU SĐT · CỘNG % HẠNG THẺ / TRỪ TẠI QUẦY)
           ══════════════════════════════════════════════════════════════ */
        <CustomersPanel initialSubTab="detail" />
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1: COMPLETED ORDER — BARISTA TICKET & RECEIPT PREVIEW
         ══════════════════════════════════════════════════════════════ */}
      {completedOrder && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCard}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalSuccessBadge}>✓ ĐÃ GHI NHẬN ĐƠN HÀNG</span>
                <h3 className={styles.modalTitle}>Đơn #{completedOrder.orderCode}</h3>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setCompletedOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalTabs}>
              <button
                type="button"
                className={`${styles.modalTabBtn} ${previewTab === 'receipt' ? styles.modalTabActive : ''}`}
                onClick={() => setPreviewTab('receipt')}
              >
                🧾 Biên nhận thanh toán
              </button>
              <button
                type="button"
                className={`${styles.modalTabBtn} ${previewTab === 'barista' ? styles.modalTabActive : ''}`}
                onClick={() => setPreviewTab('barista')}
              >
                🏷️ Phiếu pha chế ({completedOrder.items.reduce((s, i) => s + i.quantity, 0)} ly)
              </button>
            </div>

            <div className={styles.modalBody}>
              {previewTab === 'receipt' ? (
                <div className={styles.receiptPreviewSheet}>
                  <div className={styles.sheetHeader}>
                    <strong>Ủ LAB — {staffInfo.locationName}</strong>
                    <span>BIÊN NHẬN THANH TOÁN</span>
                    <small>
                      Mã đơn: #{completedOrder.orderCode} ·{' '}
                      {new Date(completedOrder.createdAt).toLocaleString('vi-VN')}
                    </small>
                    <small>
                      KH: {completedOrder.customerName} · Thu ngân: {completedOrder.cashierName}
                    </small>
                  </div>
                  <div className={styles.sheetItems}>
                    {completedOrder.items.map((it, i) => (
                      <div key={i} className={styles.sheetItemRow}>
                        <div>
                          <strong>
                            {it.quantity}× {it.productName} ({it.sizeLabel})
                          </strong>
                          {it.optionsSummary && (
                            <div className={styles.sheetItemOpt}>{it.optionsSummary}</div>
                          )}
                        </div>
                        <span>{formatVND(it.subtotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div className={styles.sheetTotals}>
                    <div className={styles.sheetSumRow}>
                      <span>Tạm tính:</span>
                      <span>{formatVND(completedOrder.subtotal)}</span>
                    </div>
                    {completedOrder.discountAmount > 0 && (
                      <div className={styles.sheetSumRow}>
                        <span>
                          Giảm giá ({completedOrder.discountPercent}%
                          {completedOrder.discountReason ? ` - ${completedOrder.discountReason}` : ''}):
                        </span>
                        <span>−{formatVND(completedOrder.discountAmount)}</span>
                      </div>
                    )}
                    {completedOrder.pointsUsed > 0 && (
                      <div className={styles.sheetSumRow}>
                        <span>Trừ điểm thành viên:</span>
                        <span>−{formatVND(completedOrder.pointsUsed)}</span>
                      </div>
                    )}
                    <div className={styles.sheetGrandTotal}>
                      <span>TỔNG THANH TOÁN:</span>
                      <span>{formatVND(completedOrder.totalDue)}</span>
                    </div>
                    <div className={styles.sheetSumRow}>
                      <span>Khách đưa (Tiền):</span>
                      <span>{formatVND(completedOrder.amountReceived)}</span>
                    </div>
                    <div className={styles.sheetSumRow}>
                      <span>Tiền thừa:</span>
                      <strong>{formatVND(completedOrder.changeDue)}</strong>
                    </div>
                    {completedOrder.pointsUsed > 0 ? (
                      <div
                        className={styles.sheetSumRow}
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px dashed #cbd5e1',
                          color: '#92400e',
                          fontWeight: 700,
                        }}
                      >
                        <span>ℹ️ Đơn áp dụng trừ tiền ví:</span>
                        <strong>
                          Không tích điểm mới (0đ)
                          {completedOrder.memberPointBalance !== undefined
                            ? ` · Ví còn: ${formatVND(completedOrder.memberPointBalance)}`
                            : ''}
                        </strong>
                      </div>
                    ) : completedOrder.pointsEarned && completedOrder.pointsEarned > 0 ? (
                      <div
                        className={styles.sheetSumRow}
                        style={{
                          marginTop: 6,
                          paddingTop: 6,
                          borderTop: '1px dashed #cbd5e1',
                          color: '#047857',
                          fontWeight: 700,
                        }}
                      >
                        <span>🎁 Điểm tích tự động ({completedOrder.customerPhone}):</span>
                        <strong>
                          +{formatVND(completedOrder.pointsEarned)}
                          {completedOrder.memberPointBalance !== undefined
                            ? ` (Ví: ${formatVND(completedOrder.memberPointBalance)})`
                            : ''}
                        </strong>
                      </div>
                    ) : null}
                  </div>
                  <div className={styles.sheetQrSection}>
                    <span>Ủ LAB Rewards® — Tích Điểm Bằng SĐT Tại Quầy</span>
                    <small style={{ color: '#475569', display: 'block', marginTop: 4 }}>
                      Đọc SĐT tại quầy để tích điểm 3%–10% theo hạng thẻ và trừ tiền trực tiếp tại quầy (Đơn trừ tiền không tích điểm mới).
                    </small>
                  </div>
                </div>
              ) : (
                <div className={styles.baristaTicketsPreviewList}>
                  {(() => {
                    const totalCups = completedOrder.items.reduce((s, i) => s + i.quantity, 0);
                    let seq = 1;
                    return completedOrder.items.flatMap((it, idx) =>
                      Array.from({ length: it.quantity }).map((_, cupIdx) => {
                        const currentCup = seq++;
                        return (
                          <div key={`${idx}-${cupIdx}`} className={styles.baristaTicketCard}>
                            <div className={styles.baristaTicketTop}>
                              <strong>#{completedOrder.orderCode}</strong>
                              <span className={styles.cupCountBadge}>
                                Ly {currentCup}/{totalCups}
                              </span>
                            </div>
                            <div className={styles.baristaDrinkTitle}>
                              <span>{it.productName}</span>
                              <strong>Size {it.sizeLabel}</strong>
                            </div>
                            <div className={styles.baristaDrinkOpts}>
                              {it.optionsSummary || '100% đường · 100% đá'}
                            </div>
                            {completedOrder.note && (
                              <div className={styles.baristaOrderNote}>
                                Ghi chú đơn: {completedOrder.note}
                              </div>
                            )}
                          </div>
                        );
                      })
                    );
                  })()}
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.printActionBtn}
                onClick={() => handlePrintBaristaTicket(completedOrder)}
              >
                🖨️ In Phiếu Pha Chế
              </button>
              <button
                type="button"
                className={styles.printActionBtnPrimary}
                onClick={() => handlePrintReceipt(completedOrder, completedOrderQrDataUrl)}
              >
                🧾 In Biên Nhận Khách
              </button>
              <button
                type="button"
                className={styles.modalDoneBtn}
                onClick={() => setCompletedOrder(null)}
              >
                Đóng &amp; Tạo đơn mới
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL 2: ROLE-BASED ORDER CANCELLATION WITH MANDATORY REASON
         ══════════════════════════════════════════════════════════════ */}
      {cancellingOrder && (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modalCardSmall}>
            <div className={styles.modalHeader}>
              <div>
                <h3 className={styles.modalTitle}>Hủy Đơn Hàng #{cancellingOrder.orderCode}</h3>
                <p className={styles.sectionSubDesc}>
                  Đơn hàng sẽ chuyển sang trạng thái Đã hủy (CANCELLED), lưu vết kiểm toán, tự động thu hồi điểm tích lũy đã cộng từ đơn này và hoàn lại điểm khách đã dùng (nếu có).
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setCancellingOrder(null)}
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <label className={styles.fieldLabel}>Lý do hủy đơn (bắt buộc) *</label>
              <input
                type="text"
                placeholder="VD: Khách đổi món, Nhập sai size, Khách hủy đơn..."
                value={cancelReasonInput}
                onChange={(e) => setCancelReasonInput(e.target.value)}
                className={styles.compactInput}
                autoFocus
              />
              <div className={styles.quickNoteChips} style={{ marginTop: 8 }}>
                {['Khách đổi món (tạo đơn mới)', 'Thu ngân bấm nhầm size', 'Khách báo hủy'].map(
                  (reasonChip) => (
                    <button
                      key={reasonChip}
                      type="button"
                      className={styles.miniChip}
                      onClick={() => setCancelReasonInput(reasonChip)}
                    >
                      {reasonChip}
                    </button>
                  )
                )}
              </div>

              {cancelError && (
                <div className={styles.errorAlert} style={{ marginTop: 10 }} role="alert">
                  ⚠️ {cancelError}
                </div>
              )}
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalDoneBtn}
                onClick={() => setCancellingOrder(null)}
              >
                Quay lại
              </button>
              <button
                type="button"
                className={styles.batchDeleteBtn}
                disabled={isCancelling}
                onClick={handleConfirmCancelOrder}
              >
                {isCancelling ? 'Đang xử lý hủy...' : 'Xác nhận Hủy Đơn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
