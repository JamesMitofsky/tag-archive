---
name: skeleton
description: >-
  Build UI in this SvelteKit project with Skeleton (Skeleton Labs v4, @skeletonlabs/skeleton
  + @skeletonlabs/skeleton-svelte) on Tailwind v4. Use this WHENEVER the work touches Skeleton
  or its building blocks — even when "Skeleton" is not named. Triggers include: adding or styling
  buttons, cards, badges, chips, dialogs, forms/inputs, tables, avatars, accordions, tabs,
  toasts, tooltips, menus, sliders, date pickers, combobox/listbox, tree views, app bars,
  navigation, carousels, steps, pagination, progress bars, segmented controls, switches; using
  preset classes (preset-filled, preset-tonal, preset-outlined); Skeleton color tokens
  (surface/primary/secondary/tertiary/success/warning/error and pairings like
  bg-surface-50-950 or text-primary-500); themes and data-theme; dark mode; theme/typography/
  spacing/masks/corner-shape setup. Also use for wiring Skeleton into the global stylesheet or
  picking/registering a theme. Prefer this skill over generic Tailwind guesses so output matches
  the installed design system.
---

# Skeleton (Skeleton Labs) — this project

Skeleton is a Tailwind-based design system + component suite. Two layers:

1. **Design system** — themes, color tokens, typography, spacing, presets. Pure CSS/Tailwind, framework-agnostic.
2. **Components** — two kinds:
   - **Tailwind components**: styled with utility classes only (`class="btn preset-filled"`). No import. Native HTML elements.
   - **Svelte components**: imported from `@skeletonlabs/skeleton-svelte` (`import { Accordion } from '@skeletonlabs/skeleton-svelte'`). Compound APIs (`<Accordion.Item>`), built on Zag.js.

## This project's stack (verify before assuming)

- `@skeletonlabs/skeleton` + `@skeletonlabs/skeleton-svelte` **v4** (installed)
- Tailwind **v4**, Svelte **5** (runes), SvelteKit
- Global stylesheet: `src/routes/layout.css` (imported by `src/routes/+layout.svelte`)
- Icons: **`phosphor-svelte`** is installed (NOT lucide)
- `@tailwindcss/forms` + `@tailwindcss/typography` plugins active
- Active theme: **custom `tagarchive`** (`src/routes/tagarchive.css`, `data-theme="tagarchive"` in `app.html`). Serif base font, squircle corners. Edit that file to tune colors/typography; don't reintroduce a preset theme import unless switching away.

### Adapting the reference docs to THIS project

The reference files are the upstream docs. Examples there often use **React/Astro** wrappers (`.astro`, `import ... from 'lucide-react'`). Translate before using:

- **Tailwind components**: copy the `class="..."` strings verbatim into Svelte markup. Ignore the astro/react shell.
- **Svelte components**: use the `svelte` example blocks; they import from `@skeletonlabs/skeleton-svelte`.
- **Icons**: docs import `@lucide/svelte` or `lucide-react`. Swap to `phosphor-svelte` (e.g. `import { CaretDown } from 'phosphor-svelte'`) to match this repo.

## Wiring Skeleton into the stylesheet

Skeleton is installed but **not yet imported**. To activate, `src/routes/layout.css` needs the Skeleton core + a theme + a `@source` so Tailwind scans the component library's classes:

```css
@import 'tailwindcss';
@import '@skeletonlabs/skeleton';
@import '@skeletonlabs/skeleton/themes/cerberus'; /* pick a theme, see below */
@plugin '@tailwindcss/forms';
@plugin '@tailwindcss/typography';

/* Tailwind must scan the Svelte component classes (path is relative to this file) */
@source '../../node_modules/@skeletonlabs/skeleton-svelte/dist';
```

Then activate the theme on the root element in `src/app.html`:

```html
<html lang="en" data-theme="cerberus">
```

Import order matters: `tailwindcss` → `@skeletonlabs/skeleton` → theme(s). Confirm the current state of these files before editing; don't assume this is already done.

**Installed themes** (import path `@skeletonlabs/skeleton/themes/{name}`): catppuccin, cerberus, concord, crimson, fennec, hamlindigo, legacy, mint, modern, mona, nosh, nouveau, pine, reign, rocket, rose, sahara, seafoam, terminus, vintage, vox, wintry. Register multiple imports to switch at runtime via `data-theme`.

## Core conventions

- **Presets** = pre-styled surface classes: `preset-filled`, `preset-tonal`, `preset-outlined`, plus color variants like `preset-filled-primary-500`, `preset-tonal-secondary`. Applied to buttons, cards, badges, chips, etc.
- **Color tokens**: `{property}-{color}-{shade}` — colors `surface|primary|secondary|tertiary|success|warning|error`, shades `50…950`. E.g. `bg-primary-500`, `text-error-600`.
- **Color pairings** (light-dark auto): `{property}-{color}-{lightShade}-{darkShade}`, e.g. `bg-surface-50-950`, `text-surface-950-50`. These flip with color scheme — prefer them over hardcoding light/dark.
- **Dark mode**: driven by color scheme + pairings; see `references/design-system/dark-mode.md`.
- **Typography**: semantic classes `h1…h6`, `.anchor`, etc. See typography reference.

## Where to look — read the specific reference, not everything

`references/` mirrors the docs, one file per topic/component. Read only what the task needs.

### Design system → `references/design-system/`
`core-api.md` (@base/@theme/@utility), `themes.md`, `colors.md`, `typography.md`, `spacing.md`, `iconography.md`, `corner-shapes.md`, `masks.md`, `presets.md`, `dark-mode.md`, `layouts.md`, `globals.md`, `migrate-tailwind-v4.md`.

### Tailwind (class-only) components → `references/tailwind-components/`
`badges`, `buttons`, `cards`, `chips`, `dialogs` (native `<dialog>`), `disclosures`, `dividers`, `forms-and-inputs`, `placeholders`, `tables`.

### Svelte components → `references/svelte-components/`
`accordion`, `app-bar`, `avatar`, `carousel`, `collapsible`, `combobox`, `date-picker`, `dialog`, `file-upload`, `floating-panel`, `listbox`, `locale-provider`, `marquee`, `menu`, `navigation`, `pagination`, `popover`, `portal`, `progress-circular`, `progress-linear`, `qr-code`, `rating-group`, `segmented-control`, `slider`, `steps`, `switch`, `tabs`, `tags-input`, `toast`, `toggle-group`, `tooltip`, `tree-view`, `code-block`.

Each component file includes a working example, anatomy (the compound parts), and an API reference (props/events). Read it before writing the markup — the compound structure and prop names are exact and easy to get wrong from memory.

## Workflow for a UI task

1. Decide layer: can a Tailwind component (class-only) do it, or is an interactive Svelte component needed? Prefer the lighter class-only option when it suffices.
2. Read the matching reference file.
3. Verify Skeleton is wired (stylesheet import + theme + `@source`); wire it if missing.
4. Write Svelte 5 markup, translating icons to `phosphor-svelte` and using preset/token classes for color so it tracks the active theme.
