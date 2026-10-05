---
name: Deetoo Marketplace
colors:
  surface: '#fbf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#fbf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f0'
  surface-container: '#efeeeb'
  surface-container-high: '#eae8e5'
  surface-container-highest: '#e4e2df'
  on-surface: '#1b1c1a'
  on-surface-variant: '#5a413a'
  inverse-surface: '#30312f'
  inverse-on-surface: '#f2f0ed'
  outline: '#8f7069'
  outline-variant: '#e3beb6'
  surface-tint: '#b42902'
  primary: '#b02700'
  on-primary: '#ffffff'
  primary-container: '#d3401a'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb4a2'
  secondary: '#006d42'
  on-secondary: '#ffffff'
  secondary-container: '#8ff8ba'
  on-secondary-container: '#007346'
  tertiary: '#5c5b5e'
  on-tertiary: '#ffffff'
  tertiary-container: '#757476'
  on-tertiary-container: '#fffbfe'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad2'
  primary-fixed-dim: '#ffb4a2'
  on-primary-fixed: '#3c0700'
  on-primary-fixed-variant: '#8a1c00'
  secondary-fixed: '#8ff8ba'
  secondary-fixed-dim: '#72dba0'
  on-secondary-fixed: '#002111'
  on-secondary-fixed-variant: '#005231'
  tertiary-fixed: '#e5e1e4'
  tertiary-fixed-dim: '#c8c6c8'
  on-tertiary-fixed: '#1b1b1d'
  on-tertiary-fixed-variant: '#474649'
  background: '#fbf9f6'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2df'
typography:
  display-lg:
    fontFamily: Epilogue
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 56px
    letterSpacing: -0.025em
  display-lg-mobile:
    fontFamily: Epilogue
    fontSize: 34px
    fontWeight: '800'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Epilogue
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 30px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Epilogue
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Manrope
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Manrope
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Manrope
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.04em
  numeric-price:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: -0.01em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  space-2xs: 0.25rem
  space-xs: 0.5rem
  space-sm: 0.75rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
  space-3xl: 4rem
  gutter-mobile: 1rem
  gutter-desktop: 1.5rem
  margin-mobile: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
---

## Brand & Style
The design system establishes a premium, curated culinary identity for upscale metropolitan nodes across Nairobi—specifically tailored to Westlands, Kilimani, Kileleshwa, and Karen. Rather than feeling like an impersonal logistics utility, the interface is positioned as an editorial culinary authority: warm, intentional, dependable, and deeply human.

The visual direction merges **Minimalist Precision** with **Tactile Warmth**. Crisp layout structures, rich negative space, and disciplined typography frame hyper-vibrant gastronomy photography, artisanal merchant narratives, and real-time transit telemetry. High contrast and transparent operational micro-states instill deep institutional trust across high-value checkout journeys, M-Pesa interactions, and multi-vendor carts.

## Colors
The color architecture reflects rich East African warmth balanced against botanical clarity:

- **Primary (`#E24A24` Spiced Terracotta):** Anchors major actions, high-priority order triggers, promotional highlights, and active states. Interactive pressed variant deepens to `#D13B17`.
- **Secondary (`#0A8754` Botanical Mint):** Signals freshness, verified artisanal kitchens, rapid express routes, and successful fulfillment flows. Deep variant: `#05663F`.
- **Backgrounds & Surfaces:**
  - Base Canvas: Warm Cream (`#FAF8F5`)
  - Pure Elevated Surface: Pure White (`#FFFFFF`)
  - Grouping Containers / Inset Paneling: Oatmeal Slate (`#F4EFEA`)
  - Inverse Structural Surfaces: Deep Obsidian (`#141416`)
- **Neutrals & Text:**
  - Primary Text: Deep Charcoal Slate (`#191C1E`)
  - Secondary / Supporting: Mid Slate (`#3F484A`)
  - Subtle / Placeholder: Muted Slate (`#70797B`)
  - Structural Hairlines: Pale Oatmeal Divider (`#DEE3E5`)
- **Feedback & Semantics:**
  - Success: `#0B8043`
  - Warning / Preparation Delays: `#E37400`
  - Critical / Error: `#D93025`
  - Telemetry / Informational: `#1A73E8`

## Typography
Typographic pairings create an editorial culinary perspective:

- **Epilogue** serves as the headline and display typeface. Its structural, confident grotesque cuts bring bold culinary authority to restaurant storefronts, neighborhood banners, and dish names.
- **Manrope** powers body, metadata, inputs, and interactive controls. Its geometric clarity guarantees immediate readability across dense multi-vendor listings and checkout summaries.
- **Tabular Figures (`font-feature-settings: 'tnum'`):** Explicitly required across all price displays (`KES 1,450`), live countdown timers (`00:42`), rider distances, and cart totals to eliminate visual jitter during real-time tracking.

## Layout & Spacing
The layout follows an 8pt architectural rhythm, utilizing a fluid grid tailored to distinct device contexts:

- **Breakpoints:**
  - `Mobile`: `< 640px` (4 columns, 16px margins, 16px gutters)
  - `Tablet`: `640px - 1024px` (8 columns, 32px margins, 20px gutters)
  - `Desktop`: `> 1024px` (12 columns, max content container 1240px, 48px margins, 24px gutters)
- **Spatial Principles:**
  - Inset padding for operational components (inputs, list items) stays compact (`space-sm` to `space-md`).
  - Consumer-facing surfaces (curated vendor cards, cuisine carousels, chef features) prioritize airy negative space (`space-lg` to `space-xl`) to establish high culinary pedigree.

## Elevation & Depth
Elevation abandons harsh grey drops in favor of warm ambient shadows, tinted with charcoal and terracotta undertones:

- **Level 0 (Flat):** Canvas background (`#FAF8F5`). Borders use 1px solid `#DEE3E5`.
- **Level 1 (Surface Cards):** Pure White (`#FFFFFF`) with subtle ambient drop: `0px 2px 8px -2px rgba(25, 28, 30, 0.04), 0px 1px 3px 0px rgba(25, 28, 30, 0.06)`. Used for restaurant directory cards, menu item grids, and standard list containers.
- **Level 2 (Interactive Floating & Navigation):** `0px 8px 24px -4px rgba(25, 28, 30, 0.08), 0px 3px 6px -1px rgba(25, 28, 30, 0.04)`. Applied to sticky bottom cart sheets, active filter bars, and header panels.
- **Level 3 (Modals & Overlays):** `0px 20px 48px -8px rgba(25, 28, 30, 0.16)`. Used for checkout bottom sheets, customization sheets, and active rider tracking cards.
- **Surface Tiers:** Stacked depth is reinforced through contrast—Oatmeal (`#F4EFEA`) backgrounds house elevated Pure White (`#FFFFFF`) product units, framed with delicate low-contrast hairlines.

## Shapes
A dual-radius paradigm balances consumer elegance with functional density:

- **Base Radius (`rounded-md`, 0.5rem / 8px):** Applied to form fields, operational data tables, payment input controls, and system alert banners.
- **Container Radius (`rounded-lg`, 1rem / 16px to `rounded-xl`, 1.5rem / 24px):** Reserved for consumer cards, vendor covers, multi-vendor bundling pods, and full-bleed drawer dialogs.
- **Capsule / Pill (`rounded-full`, 9999px):** Mandated for category chips, curation badges (e.g., "Karen Exclusive", "Farm to Table"), floating counter buttons, and delivery status indicators.

## Components

### Buttons & Interactive Controls
- **Primary Action:** Solid `#E24A24` with pure white bold typography (`label-lg`), pill-shaped (`rounded-full`) or 12px corners depending on viewport. Vertical padding: 14px on mobile for generous tap accessibility.
- **Secondary / Ghost:** Oatmeal container (`#F4EFEA`) or transparent surface with a 1.5px `#DEE3E5` border, transitioning to `#191C1E` on hover.
- **Order Trigger / Floating Cart:** Obsidian (`#141416`) base featuring primary terracotta badges and tabular price totals (`numeric-price`).

### Cards & Marketplace Items
- **Restaurant Showcase Card:** Level 1 elevation, 20px radius, 16:9 ratio curated imagery with subtle bottom gradient scrim. Badges (Prep Time, Distance, Botanical Mint rating badge) hover inside top margins.
- **Menu Item Cell:** Inset card with thumbnail anchored right (80x80px, 12px radius), primary title in `Epilogue` semi-bold, and price pinned bottom-left in tabular format.

### Chips & Filter Tags
- Fully rounded pills with 8px horizontal padding and 6px vertical padding. Inactive states feature `#F4EFEA` background with `#3F484A` text; active states trigger solid `#191C1E` fill with pure white text or `#E24A24` subtle tint (`#FDF1ED`).

### Form Inputs & Checkout Fields
- Background `#FFFFFF` with 1px `#DEE3E5` border and 10px corner radius. Focus states illuminate with a 2px `#E24A24` outer glow and pure charcoal text. Labels sit outside the field using `label-md`.

### Delivery Tracking & Operational Badges
- Live status bars combine high-contrast state badges (e.g., "Kitchen Preparing", "Rider Dispatched") paired with Botanical Mint `#0A8754` pulsing telemetry indicators and real-time tabular ETA countdowns.