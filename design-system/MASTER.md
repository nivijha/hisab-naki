# HisabNaki Design System

Global source of truth for the HisabNaki marketing site + dashboard.

## Product
Voice-first digital ledger for small Indian shopkeepers. Users speak transactions in Hindi/English; app interprets intent via Gemini and records to a deterministic PostgreSQL ledger.

## Tone
Premium, editorial, minimal, confident, clean, technically sophisticated. Not corporate. Not generic.

## Brand Color Palette (Strict)

| Token | Hex | HSL | Usage | Distribution |
|-------|-----|-----|-------|--------------|
| `--color-primary` | `#183D32` | hsl(156, 33%, 16%) | Forest Green — hero bg, nav/header, footer, dark sections, primary surfaces | 60% |
| `--color-secondary` | `#F1E8D8` | hsl(38, 58%, 90%) | Warm Beige — alternating sections, cards, feature backgrounds, breathing room | 30% |
| `--color-accent` | `#A78BCE` | hsl(276, 38%, 68%) | Soft Purple — primary CTAs, highlights, active nav, badges, interactive icons | 10% |

Supporting tonal variations:
- Forest Green dark: `#0E1F19` — pressed states, subtle depth
- Forest Green light: `#2A5A4A` — subtle panel depth on forest
- Forest Green hover: `#224E40` — interactive hover
- Warm Beige dark: `#E5D9C2` — borders on beige
- Warm Beige light: `#F7F2E8` — subtle surface
- Soft Purple dark: `#8F6FB8` — pressed/hover accent
- Soft Purple light: `#D3C4E2` — subtle accent background

Text contrast rules:
- On forest: use cream `#F1E8D8` or white
- On beige: use forest `#183D32`
- On purple: use forest `#183D32`

Tailwind mapping:
- `bg-forest` / `text-forest` → `#183D32`
- `bg-beige` / `text-beige` → `#F1E8D8`
- `bg-purple` / `text-purple` → `#A78BCE`
- `hover:bg-purple-dark` → `#8F6FB8`

## Typography
Font: **Inter** (via `next/font/google`), weights 400/500/600/700.

| Role | Size | Weight | Line-height | Use |
|------|------|--------|-------------|-----|
| Hero | 56px (md 64px) | 700 | 1.1 | Landing hero headline |
| Section heading | 30px | 600 | 1.25 | Section titles |
| Subheading | 20px | 500 | 1.4 | Feature titles |
| Body | 16px | 400 | 1.6 | Paragraph copy |
| Small | 14px | 400 | 1.5 | Captions, helper text |
| Label | 12px | 600 | 1.4 | Form labels, badges |
| Mono (currency) | 14px | 500 | 1.2 | Numbers, amounts |

## Spacing
Unified spacing scale:
- Small: 8px
- Component: 16px
- Element: 24px
- Card: 32px
- Section: 80–112px

Sections: `py-[112px]` desktop, `py-20` mobile. Page gutters: `px-4` mobile, `px-8` tablet+.

## Border Radius
- sm: 8px — buttons, chips, small controls
- md: 14px — cards, inputs, standard surfaces
- lg: 22px — section cards, prominent surfaces
- xl: 28px — hero product mockups, key focal elements

## Shadows
- `shadow-soft`: `0 18px 45px rgba(24, 61, 50, 0.10)` — cards on beige
- `shadow-forest`: `0 20px 50px rgba(24, 61, 50, 0.18)` — elevated forest surfaces
- No gradients. No glassmorphism.

## Borders
`1px solid rgba(24, 61, 50, 0.14)` on forest cards; `1px solid #E5D9C2` on beige/white cards. Consistent across themes.

## Iconography
`lucide-react` only. One icon family. Stroke width consistent (2px). No emojis as structural icons.

## Touch Targets
Minimum 44×44px. Expand hit area via padding on small icons.

## Motion
- Duration: 150–300ms micro-interactions; ≤400ms page/section transitions
- Easing: ease-out enter, ease-in exit; spring for natural feel
- Button press: scale 0.95–0.97 on active; purple background on press
- Card hover: lift `-2px`, subtle shadow increase
- Reveals: fade + slight upward translate (framer-motion), respect `prefers-reduced-motion`
- Modal/sheet: scale + fade from trigger

## Layout
- Max container width: 1200px
- Mobile-first breakpoints: 640 / 768 / 1024 / 1280 / 1440
- No horizontal scroll. Safe-area padding for fixed bars.
- Line length: 60–75 chars desktop; 35–60 mobile.

## Accessibility
- Visible focus rings (2–4px)
- `aria-label` on icon-only buttons
- Semantic HTML (`<main>`, `<nav>`, `<section>`, `<h1>` hierarchy)
- 4.5:1 contrast minimum for body text
- `prefers-reduced-motion` respected

## Anti-Patterns (avoid)
- Emoji as icons
- Raw hex in components (use tokens/Tailwind config)
- Purple, blue gradients, neon green, random accent colors
- Generic AI website gradient backgrounds
- Coral overpowering navy and cream
- Alternating unrelated color themes
- Horizontal scroll on mobile
- Placeholder-only form labels
- Tiny tap targets (<44px)
- Excessive animation (>500ms or constant motion)
- Endless grids of identical cards
- Random floating decorative shapes
- Excessive rounded containers
- Unnecessary glassmorphism
- Repeated feature descriptions
