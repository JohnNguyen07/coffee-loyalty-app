'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import { menuData, formatVND } from '@/data/menu';
import { TIERS_CONFIG, useAuth } from '@/hooks/useAuth';
import Header from '@/components/Header/Header';
import CategoryTabs from '@/components/CategoryTabs/CategoryTabs';
import MenuCard from '@/components/MenuCard/MenuCard';
import CartDrawer from '@/components/CartDrawer/CartDrawer';
import ProfilePanel from '@/components/ProfilePanel/ProfilePanel';
import FloatingCartBar from '@/components/FloatingCartBar/FloatingCartBar';
import {
  CategorySvgIcon,
  StarSolidIcon,
  SearchIcon,
  TierSvgIcon,
  FlaskIcon,
} from '@/components/Icons/LabIcons';

export default function Home() {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlySignature, setOnlySignature] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const { profile } = useAuth();

  // If a customer scans a QR link formatted as https://domain.com/?code=XYZ, forward seamlessly to /scan?code=XYZ
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const qrCode = params.get('code');
      if (qrCode && qrCode.trim()) {
        router.replace(`/scan?code=${encodeURIComponent(qrCode.trim())}`);
      }
    }
  }, [router]);

  // Filter categories and items based on search, category tab, and signature toggle
  const displayedCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return menuData
      .filter((cat) => activeCategory === 'all' || cat.slug === activeCategory)
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((item) => {
          const matchesSearch =
            !q ||
            item.name.toLowerCase().includes(q) ||
            cat.name.toLowerCase().includes(q);
          const matchesSig = !onlySignature || Boolean(item.isSignature);
          return matchesSearch && matchesSig;
        }),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [activeCategory, searchQuery, onlySignature]);

  const totalMatchingItems = displayedCategories.reduce(
    (sum, cat) => sum + cat.items.length,
    0
  );

  return (
    <div className={styles.page}>
      <Header
        onCartClick={() => setCartOpen(true)}
        onProfileClick={() => setProfileOpen(true)}
      />

      <main className={styles.main}>
        {/* ── NOTICE BANNER: LOYALTY START DATE ── */}
        <div className={styles.loyaltyNoticeBanner}>
          <div className={styles.loyaltyNoticeInner}>
            <span className={styles.loyaltyNoticeBadge}>
              <StarSolidIcon size={13} />
              <span>THÔNG BÁO</span>
            </span>
            <p className={styles.loyaltyNoticeText}>
              Chương trình <strong>tích điểm thành viên Ủ LAB Rewards</strong> sẽ chính thức bắt đầu áp dụng từ <strong>ngày 9</strong>. Đăng ký tài khoản ngay hôm nay để nhận trước <strong>10.000đ</strong> vào ví thưởng!
            </p>
          </div>
        </div>

        {/* ── ZONE 2: MENU CATALOG & INTERACTIVE FILTER BAR ── */}
        <section id="menu-section" className={styles.menuSection}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionHeading}>Chọn thức uống yêu thích của bạn</h2>
            </div>

            {/* Search & Signature Filter Controls */}
            <div className={styles.filterControls}>
              <div className={styles.searchWrap}>
                <SearchIcon size={16} className={styles.searchIcon} />
                <input
                  type="search"
                  placeholder="Tìm Matcha, Cold Brew, Cam sả..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={styles.searchInput}
                  aria-label="Tìm kiếm thức uống"
                />
              </div>

              <button
                type="button"
                className={`${styles.signatureFilterPill} ${onlySignature ? styles.signatureFilterActive : ''}`}
                onClick={() => setOnlySignature(!onlySignature)}
                aria-pressed={onlySignature}
              >
                <StarSolidIcon size={13} />
                <span>Signature</span>
              </button>
            </div>
          </div>

          {/* Category Pill Tabs */}
          <CategoryTabs
            categories={menuData}
            activeSlug={activeCategory}
            onSelect={setActiveCategory}
            showAllOption={true}
          />

          {/* Menu Categories & Cards */}
          {totalMatchingItems === 0 ? (
            <div className={styles.emptyMenuBox}>
              <FlaskIcon size={36} className={styles.emptyMenuIcon} />
              <h3 className={styles.emptyMenuTitle}>Không tìm thấy món phù hợp</h3>
              <p className={styles.emptyMenuText}>
                Thử tìm với từ khóa khác hoặc xem toàn bộ thực đơn Ủ LAB.
              </p>
              <button
                type="button"
                className={styles.btnPrimaryOutlined}
                onClick={() => {
                  setSearchQuery('');
                  setOnlySignature(false);
                  setActiveCategory('all');
                }}
              >
                Xem tất cả thực đơn
              </button>
            </div>
          ) : (
            <div className={styles.categoriesStack}>
              {displayedCategories.map((cat) => (
                <div key={cat.slug} className={styles.categoryBlock}>
                  <div className={styles.categoryHeader}>
                    <div className={styles.categoryTitleGroup}>
                      <span className={styles.categoryIconBadge}>
                        <CategorySvgIcon slug={cat.slug} size={20} />
                      </span>
                      <div>
                        <h3 className={styles.categoryTitle}>{cat.name}</h3>
                        {cat.subtitle && (
                          <p className={styles.categorySubtitle}>{cat.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <span className={styles.categoryCount}>{cat.items.length} món</span>
                  </div>

                  <div className={styles.menuGrid}>
                    {cat.items.map((item, index) => (
                      <MenuCard key={item.id} item={item} index={index} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── ZONE 3: HOUSE GREEN & GOLD REWARDS CEREMONY BAND ── */}
        <section id="rewards-ceremony" className={styles.rewardsBand}>
          <div className={styles.rewardsBandInner}>
            <div className={styles.rewardsIntro}>
              <div className={styles.rewardsGoldEyebrow}>
                <StarSolidIcon size={14} />
                <span>Ủ LAB REWARDS® · TÍCH ĐIỂM BẮT ĐẦU TỪ NGÀY 9</span>
              </div>
              <h2 className={styles.rewardsHeadline}>
                Ly nước trên tay, hoàn điểm vào ví ngay tức thì
              </h2>
              <p className={styles.rewardsBody}>
                Mỗi ly Matcha và Cold Brew tại Ủ LAB đều đi kèm tem mã QR tích điểm riêng. Chỉ cần mở <strong>Camera điện thoại</strong> quét mã trên ly để truy cập đường link nhận hoàn điểm từ <strong>3% đến 10%</strong> và trừ trực tiếp vào những đơn đặt hàng tiếp theo.
              </p>

              <div className={styles.rewardsCtaGroup}>
                {profile ? (
                  <button
                    type="button"
                    className={styles.btnInvertedWhite}
                    onClick={() => setProfileOpen(true)}
                  >
                    Ví của bạn: {formatVND(profile.point_balance || 0)} · Xem chi tiết
                  </button>
                ) : (
                  <>
                    <Link href="/register" className={styles.btnInvertedWhite}>
                      Đăng ký nhận ngay 10.000đ
                    </Link>
                    <Link href="/login" className={styles.btnOutlinedOnDark}>
                      <span>Đăng nhập thành viên</span>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* 4-Up Rewards Status Cards */}
            <div className={styles.tiersGrid}>
              {Object.values(TIERS_CONFIG).map((tier, idx) => {
                const isCurrentUserTier =
                  profile?.tier?.code?.toUpperCase() === tier.code;
                return (
                  <div
                    key={tier.code}
                    className={`${styles.tierCard} ${isCurrentUserTier ? styles.tierCardActive : ''}`}
                  >
                    <div className={styles.tierTopStripe} data-tier={tier.code} />
                    <div className={styles.tierHeaderRow}>
                      <span className={styles.tierLevelTag}>HẠNG 0{idx + 1}</span>
                      {isCurrentUserTier && (
                        <span className={styles.currentTierPill}>Hạng của bạn</span>
                      )}
                    </div>
                    <div className={styles.tierTitleRow}>
                      <span className={styles.tierEmblem}>
                        <TierSvgIcon code={tier.code} size={20} />
                      </span>
                      <h3 className={styles.tierName}>{tier.name}</h3>
                    </div>
                    <div className={styles.tierCashbackBig}>
                      Hoàn {tier.cashbackRate}%
                      <span> / mỗi ly</span>
                    </div>
                    <ul className={styles.tierBenefits}>
                      <li>
                        Chi tiêu tích lũy:{' '}
                        <strong>
                          {tier.minSpending > 0
                            ? `Từ ${formatVND(tier.minSpending)}`
                            : 'Đăng ký miễn phí'}
                        </strong>
                      </li>
                      <li>
                        Đặc quyền: <strong>{tier.bonus}</strong>
                      </li>
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── ZONE 4: GOLD LIGHTEST CRAFT & ORDERING GUIDE ── */}
        <section className={styles.stepsSection}>
          <div className={styles.stepsContainer}>
            <div className={styles.stepCard}>
              <span className={styles.stepNumber}>01</span>
              <h3 className={styles.stepTitle}>Chọn món &amp; Cỡ ly</h3>
              <p className={styles.stepDesc}>
                Tùy chọn Size M, Size L hoặc Chai thủy tinh cùng ghi chú độ ngọt, lượng đá theo gu riêng.
              </p>
            </div>
            <div className={styles.stepCard}>
              <span className={styles.stepNumber}>02</span>
              <h3 className={styles.stepTitle}>Gửi đơn qua Messenger</h3>
              <p className={styles.stepDesc}>
                Đơn hàng được định dạng tự động và gửi thẳng tới quầy pha chế Ủ LAB chỉ với 1 chạm.
              </p>
            </div>
            <div className={styles.stepCard}>
              <span className={styles.stepNumber}>03</span>
              <h3 className={styles.stepTitle}>Mở Camera điện thoại quét tem</h3>
              <p className={styles.stepDesc}>
                Dùng Camera mặc định trên điện thoại quét tem QR dán trên ly để mở link nhận hoàn điểm tự động vào ví.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── ZONE 5: HOUSE GREEN FOOTER BOOKEND ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrandCol}>
              <div className={styles.footerBrand}>
                <div className={styles.footerLogoWrap}>
                  <Image
                    src="/logo-mark.png"
                    alt="Ủ LAB Logo"
                    width={44}
                    height={44}
                    className={styles.footerLogoImg}
                  />
                </div>
                <div>
                  <div className={styles.footerTitle}>Ủ LAB</div>
                  <div className={styles.footerSubtitle}>
                    Matcha &amp; Cold Brew Thủ Công
                  </div>
                </div>
              </div>
              <p className={styles.footerDesc}>
                Phòng thí nghiệm hương vị chuyên biệt về Matcha Fuji MK4 đánh chasen thủ công và Cold Brew ủ lạnh 18 giờ. Đặt món nhanh, tích điểm minh bạch trên từng ly nước.
              </p>
            </div>

            <div className={styles.footerNavCol}>
              <h4 className={styles.footerColHeading}>Trải nghiệm Ủ LAB</h4>
              <ul className={styles.footerLinkList}>
                <li>
                  <a href="#menu-section">Thực đơn Matcha &amp; Cold Brew</a>
                </li>
                <li>
                  <a href="#rewards-ceremony">Chương trình Ủ LAB Rewards</a>
                </li>
                <li>
                  <Link href="/register">Đăng ký nhận 10.000đ</Link>
                </li>
                <li>
                  <Link href="/login">Đăng nhập thành viên</Link>
                </li>
              </ul>
            </div>

            <div className={styles.footerConnectCol}>
              <h4 className={styles.footerColHeading}>Kết nối &amp; Đặt món trực tiếp</h4>
              <p className={styles.footerConnectText}>
                Đặt món giao nhanh hoặc nhắn tin trực tiếp với barista Ủ LAB qua Facebook Fanpage.
              </p>
              <div className={styles.footerSocialRow}>
                <a
                  href={
                    process.env.NEXT_PUBLIC_FACEBOOK_SHARE_URL ||
                    'https://www.facebook.com/share/1PhbkgjNBD/?mibextid=wwXIfr'
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.footerSocialBtn}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                  <span>Facebook Fanpage</span>
                </a>

                <a
                  href="https://m.me/61595629718216"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.footerMessengerBtn}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.145 2 11.258c0 2.91 1.455 5.513 3.738 7.202V22l3.376-1.853c.913.253 1.884.39 2.886.39 5.523 0 10-4.145 10-9.279C22 6.145 17.523 2 12 2zm1.066 12.477l-2.545-2.715-4.968 2.715 5.464-5.803 2.607 2.715 4.906-2.715-5.464 5.803z" />
                  </svg>
                  <span>Nhắn tin đặt hàng</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating Circular CTA / Cart Bar */}
      <FloatingCartBar onClick={() => setCartOpen(true)} />

      {/* Slide-over Cart Drawer */}
      <CartDrawer isOpen={cartOpen} onClose={() => setCartOpen(false)} />

      {/* Slide-over Member Profile & Loyalty Panel */}
      <ProfilePanel isOpen={profileOpen} onClose={() => setProfileOpen(false)} />
    </div>
  );
}
