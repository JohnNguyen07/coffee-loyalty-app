import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/* ============================================================
   1. BESPOKE BEVERAGE ILLUSTRATIONS (Menu Cards & Hero)
   ============================================================ */

export function DrinkIllustration({
  itemId,
  categorySlug,
  className,
}: {
  itemId: string;
  categorySlug: string;
  className?: string;
}) {
  // Bottled Cold Brew (Apothecary Amber / Clear Craft Bottle)
  if (categorySlug === 'cold-brew-chai' || itemId.includes('chai') || itemId.includes('pure-black')) {
    const isLemon = itemId.includes('chanh');
    return (
      <svg
        viewBox="0 0 140 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Soft ambient halo */}
        <circle cx="70" cy="74" r="50" fill={isLemon ? 'rgba(203, 162, 88, 0.16)' : 'rgba(30, 57, 50, 0.10)'} />
        {/* Bottle shadow */}
        <ellipse cx="70" cy="124" rx="28" ry="5" fill="rgba(0,0,0,0.12)" />
        {/* Lemon slice behind bottle if chanh vang */}
        {isLemon && (
          <g transform="translate(82, 26) rotate(18)">
            <circle cx="18" cy="18" r="16" fill="#F4C430" stroke="#E5A910" strokeWidth="2" />
            <circle cx="18" cy="18" r="12" fill="#FFF7D6" />
            <path d="M18 6V30M6 18H30M9.5 9.5L26.5 26.5M26.5 9.5L9.5 26.5" stroke="#F4C430" strokeWidth="1.5" />
          </g>
        )}
        {/* Apothecary bottle body */}
        <path
          d="M57 22H83V34C83 39 96 45 96 56V112C96 118.627 90.6274 124 84 124H56C49.3726 124 44 118.627 44 112V56C44 45 57 39 57 34V22Z"
          fill="#261710"
          stroke="#1E3932"
          strokeWidth="2"
        />
        {/* Deep cold brew liquid */}
        <path
          d="M45.5 58C45.5 48 56 42 58 37H82C84 42 94.5 48 94.5 58V111C94.5 117.075 89.5751 122 83.5 122H56.5C50.4249 122 45.5 117.075 45.5 111V58Z"
          fill="url(#bottleLiquid)"
        />
        {/* Bottle cap (Matte black wax/screw cap) */}
        <rect x="54" y="14" width="32" height="10" rx="3" fill="#1E3932" />
        <rect x="56" y="24" width="28" height="3" fill="#CBA258" />
        {/* Craft Minimalist Lab Label */}
        <rect x="48" y="62" width="44" height="42" rx="4" fill="#F2F0EB" stroke="#CBA258" strokeWidth="1" />
        <rect x="52" y="67" width="18" height="3" rx="1.5" fill="#006241" />
        <text x="52" y="81" fill="#1E3932" fontSize="8" fontWeight="800" fontFamily="sans-serif" letterSpacing="0.06em">
          Ủ LAB
        </text>
        <text x="52" y="90" fill="#5C5F5D" fontSize="5.5" fontWeight="600" fontFamily="sans-serif">
          {isLemon ? 'CITRUS BREW' : '18H PURE BREW'}
        </text>
        <line x1="52" y1="95" x2="88" y2="95" stroke="#DFC49D" strokeWidth="1" />
        <circle cx="84" cy="70" r="3" fill="#CBA258" />
        {/* Glass highlight */}
        <path d="M49 54V112" stroke="rgba(255,255,255,0.28)" strokeWidth="2.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="bottleLiquid" x1="45" y1="40" x2="95" y2="122" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isLemon ? '#5E2C14' : '#23120B'} />
            <stop offset="60%" stopColor={isLemon ? '#3B1909' : '#160B06'} />
            <stop offset="100%" stopColor={isLemon ? '#7C421C' : '#2E170D'} />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // Matcha Series (Ceremonial Layered Uji Matcha in Clear Lab Glass)
  if (categorySlug === 'matcha') {
    const isColdWhisk = itemId.includes('cold-whisk');
    const isCoco = itemId.includes('coco');
    const isOat = itemId.includes('oat');

    return (
      <svg
        viewBox="0 0 140 140"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        aria-hidden="true"
      >
        {/* Soft mint halo */}
        <circle cx="70" cy="74" r="50" fill="rgba(0, 117, 74, 0.11)" />
        {/* Drop shadow */}
        <ellipse cx="70" cy="124" rx="30" ry="5" fill="rgba(0,0,0,0.10)" />

        {/* Straw */}
        <path
          d="M84 14L73 108"
          stroke="#006241"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M84 14L73 108"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />

        {/* Cup outer shell */}
        <path
          d="M40 34H100L93 114C92.4 119.6 87.7 124 82 124H58C52.3 124 47.6 119.6 47 114L40 34Z"
          fill="#FFFFFF"
          stroke="#1E3932"
          strokeWidth="2"
        />

        {/* Bottom milk / coconut layer */}
        <path
          d="M44.5 74H95.5L92 113C91.5 117.5 87.7 121 83 121H57C52.3 121 48.5 117.5 48 113L44.5 74Z"
          fill={isOat ? '#EFE6D5' : isCoco ? '#F7F9F7' : '#F6F4EE'}
        />

        {/* Swirl transition wave between matcha and milk/coconut */}
        <path
          d="M42 42H98L95.5 78C86 84 78 71 70 77C62 83 54 72 44.5 78L42 42Z"
          fill="url(#matchaLayerGrad)"
        />

        {/* Rich ceremonial micro-foam top */}
        <path
          d="M41.5 36H98.5L98 44H42L41.5 36Z"
          fill={isColdWhisk ? '#568E43' : '#6BA353'}
        />

        {/* Ice cubes */}
        <rect x="51" y="54" width="14" height="14" rx="3.5" transform="rotate(-8 51 54)" fill="rgba(255,255,255,0.55)" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
        <rect x="72" y="58" width="15" height="15" rx="3.5" transform="rotate(11 72 58)" fill="rgba(255,255,255,0.5)" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
        <rect x="58" y="82" width="14" height="14" rx="3.5" transform="rotate(6 58 82)" fill="rgba(255,255,255,0.65)" stroke="rgba(0,98,65,0.15)" strokeWidth="1" />

        {/* Cup rim */}
        <rect x="37" y="30" width="66" height="5" rx="2.5" fill="#1E3932" />

        {/* Minimalist cup badge */}
        <circle cx="70" cy="84" r="10" fill="#FFFFFF" stroke="#006241" strokeWidth="1.5" />
        <path d="M66 85C66 81 70 79 74 81C74 85 70 88 66 85Z" fill="#00754A" />

        {/* Specular glass reflection */}
        <path d="M46 42L51 110" stroke="rgba(255,255,255,0.55)" strokeWidth="3" strokeLinecap="round" />

        <defs>
          <linearGradient id="matchaLayerGrad" x1="70" y1="40" x2="70" y2="82" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1E5E3A" />
            <stop offset="55%" stopColor="#3B7A47" />
            <stop offset="100%" stopColor="#76A865" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  // Cold Brew Series (18h Steeped Specialty Cold Brew with Botanicals)
  const isOrangeLemongrass = itemId.includes('cam-sa');
  const isLychee = itemId.includes('vai');
  const isLemon = itemId.includes('chanh-vang');
  const isCoconut = itemId.includes('nuoc-dua');

  return (
    <svg
      viewBox="0 0 140 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Warm amber/botanical halo */}
      <circle
        cx="70"
        cy="74"
        r="50"
        fill={
          isOrangeLemongrass
            ? 'rgba(234, 136, 52, 0.14)'
            : isLychee
              ? 'rgba(224, 122, 134, 0.14)'
              : isLemon
                ? 'rgba(238, 189, 49, 0.15)'
                : 'rgba(203, 162, 88, 0.14)'
        }
      />
      <ellipse cx="70" cy="124" rx="30" ry="5" fill="rgba(0,0,0,0.10)" />

      {/* Botanical garnish behind rim */}
      {isOrangeLemongrass && (
        <g transform="translate(76, 14) rotate(15)">
          <circle cx="18" cy="18" r="15" fill="#F97316" stroke="#C2410C" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="11.5" fill="#FFEDD5" />
          <circle cx="18" cy="18" r="9.5" fill="#FB923C" />
          <path d="M18 8V28M8 18H28" stroke="#FFEDD5" strokeWidth="1.3" />
        </g>
      )}
      {isLemon && (
        <g transform="translate(76, 14) rotate(12)">
          <circle cx="18" cy="18" r="15" fill="#FACC15" stroke="#CA8A04" strokeWidth="1.8" />
          <circle cx="18" cy="18" r="11.5" fill="#FEF9C3" />
          <path d="M18 7V29M7 18H29" stroke="#EAB308" strokeWidth="1.3" />
        </g>
      )}
      {isLychee && (
        <g transform="translate(78, 16)">
          <circle cx="14" cy="16" r="11" fill="#FFF1F2" stroke="#FDA4AF" strokeWidth="2" />
          <circle cx="14" cy="16" r="4" fill="#881337" opacity="0.7" />
        </g>
      )}

      {/* Straw */}
      <path d="M56 15L66 108" stroke="#1E3932" strokeWidth="5" strokeLinecap="round" />

      {/* Cup body */}
      <path
        d="M40 34H100L93 114C92.4 119.6 87.7 124 82 124H58C52.3 124 47.6 119.6 47 114L40 34Z"
        fill="#FFFFFF"
        stroke="#1E3932"
        strokeWidth="2"
      />

      {/* Cold Brew Liquid */}
      <path
        d="M41.8 40H98.2L92 113C91.5 117.5 87.7 121 83 121H57C52.3 121 48.5 117.5 48 113L41.8 40Z"
        fill={isCoconut ? 'url(#coldBrewCocoGrad)' : 'url(#coldBrewAmberGrad)'}
      />

      {/* Ice cubes */}
      <rect x="50" y="50" width="15" height="15" rx="3.5" transform="rotate(-10 50 50)" fill="rgba(255,255,255,0.38)" stroke="rgba(255,255,255,0.75)" strokeWidth="1" />
      <rect x="71" y="55" width="15" height="15" rx="3.5" transform="rotate(14 71 55)" fill="rgba(255,255,255,0.32)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" />
      <rect x="57" y="76" width="15" height="15" rx="3.5" transform="rotate(5 57 76)" fill="rgba(255,255,255,0.28)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />

      {/* Cup rim */}
      <rect x="37" y="30" width="66" height="5" rx="2.5" fill="#1E3932" />

      {/* Center stamp */}
      <circle cx="70" cy="84" r="10" fill="rgba(242, 240, 235, 0.92)" stroke="#CBA258" strokeWidth="1.5" />
      <circle cx="70" cy="84" r="4" fill="#1E3932" />

      {/* Glass highlight */}
      <path d="M46 42L51 110" stroke="rgba(255,255,255,0.42)" strokeWidth="3" strokeLinecap="round" />

      <defs>
        <linearGradient id="coldBrewAmberGrad" x1="70" y1="40" x2="70" y2="121" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B1A0E" />
          <stop offset="55%" stopColor="#6D3218" />
          <stop offset="100%" stopColor="#B45B28" />
        </linearGradient>
        <linearGradient id="coldBrewCocoGrad" x1="70" y1="40" x2="70" y2="121" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B1A0E" />
          <stop offset="48%" stopColor="#7C4323" />
          <stop offset="75%" stopColor="#E6DFD3" />
          <stop offset="100%" stopColor="#F5F3EE" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ============================================================
   2. STARBUCKS PDP CUP SIZE SILHOUETTE ICONS
   ============================================================ */

export function CupSizeIcon({
  sizeLabel,
  active,
}: {
  sizeLabel: string;
  active?: boolean;
}) {
  const isBottle = sizeLabel.toLowerCase().includes('chai');
  const isLarge = sizeLabel.toUpperCase() === 'L';

  if (isBottle) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 3H15M10 3V6C10 7.5 7 8.5 7 11V19C7 20.1 7.9 21 9 21H15C16.1 21 17 20.1 17 19V11C17 8.5 14 7.5 14 6V3"
          stroke="currentColor"
          strokeWidth={active ? '2.2' : '1.7'}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="9" y="12" width="6" height="5" rx="1" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.3" />
      </svg>
    );
  }

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {isLarge ? (
        <>
          <path d="M5 6H19" stroke="currentColor" strokeWidth={active ? '2.2' : '1.7'} strokeLinecap="round" />
          <path
            d="M6.5 6L8 19.2C8.1 20.2 9 21 10 21H14C15 21 15.9 20.2 16 19.2L17.5 6"
            stroke="currentColor"
            strokeWidth={active ? '2.2' : '1.7'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13 3L11.5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M6 8H18" stroke="currentColor" strokeWidth={active ? '2.2' : '1.7'} strokeLinecap="round" />
          <path
            d="M7.5 8L8.7 19.2C8.8 20.2 9.6 21 10.6 21H13.4C14.4 21 15.2 20.2 15.3 19.2L16.5 8"
            stroke="currentColor"
            strokeWidth={active ? '2.2' : '1.7'}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13 4.5L11.8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/* ============================================================
   3. CATEGORY & TIER EMBLEM SVGs
   ============================================================ */

export function CategorySvgIcon({ slug, size = 18 }: { slug: string; size?: number }) {
  if (slug === 'matcha') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M17 3C11 3 5 7 5 14C5 16.5 6.5 19 9 20C10.5 15.5 13.5 12 18 10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 14C9 19 16 19 19 12C20.2 9.2 19.5 5 17 3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (slug === 'cold-brew-chai') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 2H15M10 2V5.5C10 7.2 7 8.2 7 11V19C7 20.6569 8.34315 22 10 22H14C15.6569 22 17 20.6569 17 19V11C17 8.2 14 7.2 14 5.5V2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M7 13H17" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  // Default: Cold Brew (Ice Cube + Droplet)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="4"
        y="6"
        width="16"
        height="15"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M4 11H20" stroke="currentColor" strokeWidth="1.8" />
      <path d="M14 2L12 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TierSvgIcon({ code, size = 16 }: { code?: string; size?: number }) {
  const normalized = (code || 'MEMBER').toUpperCase();
  if (normalized === 'DIAMOND') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6 3H18L22 9L12 21L2 9L6 3Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M2 9H22" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (normalized === 'GOLD') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2L14.85 8.35L21.75 9.12L16.6 13.78L18.02 20.56L12 17.1L5.98 20.56L7.4 13.78L2.25 9.12L9.15 8.35L12 2Z" />
      </svg>
    );
  }
  if (normalized === 'SILVER') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path d="M12 6.5L13.6 10.1L17.5 10.5L14.5 13.1L15.4 17L12 14.9L8.6 17L9.5 13.1L6.5 10.5L10.4 10.1L12 6.5Z" fill="currentColor" />
      </svg>
    );
  }
  // MEMBER: Botanical sprout / star
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 21V11M12 11C12 7 15.5 4 20 4C20 8.5 16.5 11 12 11ZM12 14C12 10.5 8.5 8 4 8C4 12 7.5 14 12 14Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ============================================================
   4. SEMANTIC UI ICONS (Starbucks & Lab System)
   ============================================================ */

export function StarSolidIcon({ size = 14, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2L14.9 8.6L22 9.3L16.6 14L18.2 21L12 17.3L5.8 21L7.4 14L2 9.3L9.1 8.6L12 2Z" />
    </svg>
  );
}

export function SparkleIcon({ size = 16, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 2L14.4 9.6L22 12L14.4 14.4L12 22L9.6 14.4L2 12L9.6 9.6L12 2Z" />
    </svg>
  );
}

export function QrScanIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="4" height="4" rx="0.5" />
      <rect x="13" y="7" width="4" height="4" rx="0.5" />
      <rect x="7" y="13" width="4" height="4" rx="0.5" />
      <path d="M13 13h4v4h-4z" />
    </svg>
  );
}

export function ShoppingBagIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

export function UserIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function FlaskIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M10 2v6.292a4 4 0 0 1-.672 2.219l-4.656 6.984A2 2 0 0 0 6.336 20.6h11.328a2 2 0 0 0 1.664-3.105l-4.656-6.984A4 4 0 0 1 14 8.292V2" />
      <path d="M8.5 2h7" />
      <path d="M7 15h10" />
    </svg>
  );
}

export function GiftIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <polyline points="20 12 20 22 4 22 4 12" />
      <rect x="2" y="7" width="20" height="5" />
      <line x1="12" y1="22" x2="12" y2="7" />
      <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
      <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export function SearchIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function CameraIcon({ size = 18, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
