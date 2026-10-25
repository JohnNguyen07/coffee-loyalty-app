# Design System: Ủ LAB — Matcha & Cold Brew (Starbucks Flagship × UI/UX Pro Max)

## 1. Visual Theme & Atmosphere

**Ủ LAB** combines the **warm, confident retail flagship** aesthetic of Starbucks (`awesome-design-md/starbucks`) with the **artisanal craft laboratory** identity of specialty Matcha & Cold Brew (`ui-ux-pro-max`).

The canvas alternates between **Neutral Warm Cream** (`#F2F0EB`) and **Ceramic Off-White** (`#EDEBE9`) — evoking paper filters, ceramic matcha bowls (chawan), and warm café walls — while the **Four-Tier Green System** (`#006241` Starbucks Green, `#00754A` Green Accent, `#1E3932` House Green, `#2B5148` Green Uplift) anchors every brand moment, hero band, CTA pill, and Rewards experience. **Rewards Gold** (`#CBA258`) is reserved strictly for loyalty stars, cashback ceremony, and signature craft badges.

### Key Characteristics
- **Four-tier green brand system**:
  - **Starbucks Green (`#006241`)**: Primary brand signal, section headers, active category highlights
  - **Green Accent (`#00754A`)**: Luminous interactive green for primary filled CTAs, cup-size selection rings, and the floating circular Frap button
  - **House Green (`#1E3932`)**: Deep espresso-matcha green for hero feature bands, Rewards status panels, Admin navigation sidebar, and the footer bookend
  - **Green Uplift (`#2B5148`)**: Mid-dark botanical green for subtle surface contrasts and card accents
- **Gold reserved for Rewards & Signature ceremony (`#CBA258`)**: Cashback badges, loyalty progress, and Signature drink callouts
- **Warm-neutral café canvas (`#F2F0EB` / `#EDEBE9`)**: Never cold pure white for the page background; pure white (`#FFFFFF`) is reserved for elevated cards and modals
- **Full-pill buttons (`50px` / `9999px` radius)** universally, with `transform: scale(0.95)` active press feedback
- **Floating "Frap" Circular Order CTA (`56px` diameter, `#00754A` fill)** with multi-layer ambient shadow stack
- **Zero structural emojis**: All navigation, category tabs, tier emblems, and drink visuals use bespoke vector SVGs (`ui-ux-pro-max` strict rule)

---

## 2. Color Palette & Semantic Tokens

| Token | Hex / Value | Role |
|-------|-------------|------|
| `--sb-green` | `#006241` | Historic brand green — primary headings, brand badges |
| `--sb-accent` | `#00754A` | Interactive CTA green — filled pill buttons, active rings, Frap CTA |
| `--sb-house` | `#1E3932` | Deep House Green — feature bands, Rewards cards, Admin sidebar, footer |
| `--sb-uplift` | `#2B5148` | Secondary mid-dark green — subtle dark accents |
| `--sb-mint` | `#D4E9E2` | Pale matcha mint wash — active chip fills, valid field tints |
| `--sb-gold` | `#CBA258` | Rewards Gold — loyalty stars, cashback tags, Signature badges |
| `--sb-gold-light` | `#DFC49D` | Soft gold border and badge wash |
| `--sb-gold-wash` | `#FAF6EE` | Cream-gold surface wash for Rewards ceremony sections |
| `--surface` | `#F2F0EB` | Primary page canvas (Neutral Warm cream) |
| `--surface-dim` | `#EDEBE9` | Secondary canvas / Ceramic zone separator |
| `--surface-cool` | `#F9F9F9` | Quiet utility container / input surface |
| `--surface-card` | `#FFFFFF` | Elevated card, drawer, and modal surface |
| `--ink-deep` | `rgba(0, 0, 0, 0.87)` | Warm primary text on light surfaces (`#1F2120`) |
| `--ink-muted` | `rgba(0, 0, 0, 0.58)` | Secondary metadata text on light surfaces (`#5C5F5D`) |
| `--ink-rewards` | `#33433D` | Dedicated muted slate-green for Rewards copy |

---

## 3. Typography Rules

- **Primary Sans (`--font-sans`)**: `'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif` — geometric-humanist proportions matching SoDoSans with `-0.01em` (`-0.16px`) tight tracking and complete Vietnamese diacritic support.
- **Rewards Editorial Serif (`--font-serif`)**: `'Lora', Georgia, serif` — warm editorial serif reserved for hero headlines and Rewards ceremony titles (substituting Lander Tall).
- **Monospace (`--font-mono`)**: `'JetBrains Mono', monospace` — used for QR codes, order numbers, and POS receipts.

---

## 4. Elevation, Radii & Micro-Interactions

- **Card Radius**: `12px` (`--radius-card`)
- **Button Radius**: `50px` full-pill (`--radius-pill`)
- **Card Shadow**: `0 0 0.5px rgba(0,0,0,0.14), 0 1px 2px rgba(0,0,0,0.18)`
- **Global Nav Shadow**: `0 1px 3px rgba(0,0,0,0.10), 0 2px 2px rgba(0,0,0,0.06), 0 0 2px rgba(0,0,0,0.07)`
- **Frap CTA Shadow**: `0 0 6px rgba(0,0,0,0.24), 0 8px 12px rgba(0,0,0,0.14)`
- **Button Press Feedback**: `transform: scale(0.95)` over `180ms ease`
