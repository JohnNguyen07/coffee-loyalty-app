# MASTER Design System — Ủ LAB (Matcha & Cold Brew)

## 1. Product & Brand Profile
- **Brand**: Ủ LAB — Handcrafted Matcha & Cold Brew Take-away + QR Cashback Loyalty
- **Design Archetype**: Starbucks Retail Flagship (`awesome-design-md`) × Artisanal Beverage Lab (`ui-ux-pro-max`)
- **Platform**: Next.js 16 Web Application (Mobile-First Consumer Ordering + QR Scanner + Admin POS)

## 2. Color Tokens
- **Canvas**: `#F2F0EB` (Neutral Warm), `#EDEBE9` (Ceramic), `#FFFFFF` (Card Surface)
- **Greens**: `#006241` (Starbucks Green), `#00754A` (Green Accent CTA), `#1E3932` (House Green Band/Footer), `#2B5148` (Green Uplift), `#D4E9E2` (Green Light Wash)
- **Rewards Gold**: `#CBA258` (Gold), `#DFC49D` (Gold Light), `#FAF6EE` (Gold Lightest)
- **Text**: `rgba(0,0,0,0.87)` (Text Black), `rgba(0,0,0,0.58)` (Text Black Soft), `#FFFFFF` (Text White), `rgba(255,255,255,0.72)` (Text White Soft)

## 3. UI/UX Pro Max Guardrails
1. **No Emojis as Icons**: Use custom inline SVGs (`LabIcons.tsx`) for all UI controls, category tabs, loyalty tiers, and drink illustrations.
2. **Touch Targets**: Minimum `44x44px` hit areas on mobile controls, navigation items, and size selectors.
3. **Color-Block Rhythm**: Alternate `#F2F0EB` cream canvas, `#FFFFFF` cards, `#1E3932` House Green feature bands, and `#FAF6EE` Gold Lightest loyalty zones.
4. **Universal Pill Geometry**: `50px` border-radius on all action buttons with `scale(0.95)` active state.
5. **Contrast & Accessibility**: Maintain >= 4.5:1 text contrast on both cream and House Green surfaces; include `aria-hidden="true"` on decorative SVGs and explicit `aria-label` on icon buttons.
