# Dopl: design system

> The bar is "a product you'd pay for", not "a nice admin panel".
> Reference: `docs/design/spott-reference.png` (Spott). Brand: `assets/brand/`.
> Everything here becomes CSS variables in `apps/web/src/app/globals.css` (Tailwind v4 `@theme`). Components use tokens only: **no raw hex values in component code** (lint rule).

---

## 1. Principles

1. **Calm and airy.** A light-grey canvas, one white working panel, lots of whitespace, crisp 1px hairlines and almost no shadows. Colour is information, not decoration.
2. **The brand is the accent, not the paint.** Primary buttons are near-black. The lavender→sky gradient only appears on the logo, the AI teammate and at most two hero moments. We never use it as a background fill. We avoid the generic purple AI-app look.
3. **Dense but legible.** Spott-like comfortable rows by default and a compact mode for power users. Numbers and dates use tabular figures.
4. **Keyboard first, mouse friendly.** Every action has a visible shortcut hint, and every property can be edited inline where it's shown.
5. **Nothing jumps.** Skeletons match final layouts exactly, optimistic updates apply instantly, there are no full-page spinners, and 120–200 ms ease-out motion is used for state changes only.
6. **Every state is designed.** Empty, loading (skeleton), error, partial, offline, no permission and read-only (guest) states all get real designs.

---

## 2. Reading the reference (Spott)

Measured from the screenshot. It was captured at roughly 1.44× device scale, so the numbers below are converted to CSS px. They are **starting points to verify with screenshot overlays**, not gospel.

| Element        | Observation                                                                                                                     | Dopl value                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Canvas         | Very light neutral grey behind everything                                                                                       | `--canvas #F5F5F6`                                                                                  |
| Sidebar        | Sits directly on the canvas with no border or background; about 250 px wide                                                     | 248 px, resizable 216–320                                                                           |
| Logo row       | Mark + wordmark, bold, about 20 px text                                                                                         | 30 px mark + "Dopl" in `title-lg` bold, 36 px row                                                   |
| Search field   | White, 1px border, radius ~10, magnifier icon, `⌘K` hint at right                                                               | 36 px tall, radius 10                                                                               |
| Nav item       | Icon ~18 px + label ~15 px medium grey-700; pitch ~42 px                                                                        | Denser than Spott (D-129): 32 px item, 2 px gap, `body` medium, 16 px icon; sub-items 28 px `small` |
| Section label  | "Workspace", "Records", "Tools": small, light grey, sentence case, extra top spacing                                            | 12/16/500, `--text-muted`, 16 px top margin                                                         |
| Active item    | Soft grey pill spanning the sidebar width                                                                                       | `--sidebar-active #EBEBED`, radius 10                                                               |
| Main panel     | White, radius ~16, hairline border, small gap from the window edge                                                              | radius 16, 1px `--border`, 8 px inset (top/right/bottom)                                            |
| Page header    | Breadcrumb with icon, "›" separator, ⓘ; right side: outlined buttons with icon + label + chevron, one near-black primary, a `⋮` | 56 px tall, 20 px side padding                                                                      |
| Buttons        | Outlined: white, 1px strong border, radius ~10, 15 px medium; primary: near-black fill, white text                              | 36 px tall, radius 10                                                                               |
| Toolbar        | Search input (placeholder), "Sorted by **Last Activity Date**" chip, "Filters" chip                                             | 48 px tall; chips 32 px                                                                             |
| Table header   | Icon + label (medium, dark) + `⋮` column menu at right; checkbox column                                                         | 40 px tall                                                                                          |
| Rows           | ~54 px, hairline separators, no zebra striping                                                                                  | 52 px comfortable / 36 px compact                                                                   |
| Identity cell  | Round avatar (~24 px) + name (medium, dark) + a small brand icon                                                                | avatar 24 px                                                                                        |
| Link chips     | Outlined chip with a person icon + value, text in link colour                                                                   | 26 px chip, radius 8                                                                                |
| Secondary text | "at Vaia (2015-2024)" in grey after a bold part; "+1" overflow in grey                                                          | `--text-muted`                                                                                      |
| Tag pills      | Pastel bg, saturated text, same-hue 1px border, radius ~6, 13–14 px medium                                                      | see §3.4                                                                                            |
| Bottom fade    | Rows fade into the panel at the bottom edge                                                                                     | 48 px gradient mask on scroll containers                                                            |

---

## 3. Tokens

### 3.1 Brand (exact, from the logo)

```css
--brand-lavender: #ada8ff;
--brand-sky: #42b0ff;
--brand-mid: #7cacff;
--brand-gradient: linear-gradient(135deg, #ada8ff 0%, #42b0ff 100%);
```

The raw brand colours are about 2.1–2.4:1 on white, so they are **never used for text**. They're for the logo, gradients, chart fills and illustrations only.

### 3.2 Accent scales

These were generated in OKLCH and anchored on the brand colours (raw lavender = 300, raw sky = 400) and the accessible text shades from the brief (both = **700**). Contrast figures are against white.

| Step | Lavender              | Contrast | Sky                   | Contrast |
| ---- | --------------------- | -------- | --------------------- | -------- |
| 50   | `#F6F6FF`             | 1.07     | `#F0F8FF`             | 1.07     |
| 100  | `#EBEBFE`             | 1.18     | `#DEEFFF`             | 1.17     |
| 200  | `#D9D8FE`             | 1.38     | `#BEE1FF`             | 1.36     |
| 300  | **`#ADA8FF`** (brand) | 2.14     | `#88C9FE`             | 1.77     |
| 400  | `#9892F6`             | 2.70     | **`#42B0FF`** (brand) | 2.36     |
| 500  | `#837DED`             | 3.43     | `#3199E8`             | 3.06     |
| 600  | `#6E67E3`             | 4.46     | `#1F82D1`             | 4.06     |
| 700  | **`#5B4FD9`** (text)  | **5.89** | **`#0A6CBA`** (text)  | **5.43** |
| 800  | `#4840AC`             | 8.06     | `#0E5693`             | 7.58     |
| 900  | `#36327F`             | 10.94    | `#12416D`             | 10.49    |

**Roles:**

- **Sky** is the primary accent: links, focus, selection, checkboxes, progress and the first chart series.
- **Lavender** is the secondary accent: the AI teammate, @mention highlights, "new" markers and the second chart series.
- Text in either hue always uses **700+**. Controls with white text on an accent (checked checkbox, selected segment) use **sky-600 or darker**, which clears the 3:1 minimum for UI components.

### 3.3 Neutrals and semantic surfaces

```css
/* Neutrals (tuned against the Spott reference) */
--neutral-0: #ffffff;
--neutral-25: #fcfcfd;
--neutral-50: #fafafa; /* muted surface */
--neutral-100: #f5f5f6; /* canvas */
--neutral-150: #f0f0f2; /* hover on canvas */
--neutral-200: #ececee; /* border (hairline) / active pill on white */
--neutral-250: #e2e2e5; /* strong border (inputs, outlined buttons) */
--neutral-300: #d4d4d8; /* dividers on muted, disabled borders */
--neutral-400: #a1a1aa; /* disabled text, decorative icons */
--neutral-500: #8b8b93; /* placeholder */
--neutral-600: #6b6b73; /* muted text   — 5.28:1 white, 4.85:1 canvas */
--neutral-700: #52525b; /* secondary text — 7.73:1 */
--neutral-800: #3f3f46; /* nav labels / icons (grey-700 in the brief) */
--neutral-900: #18181b; /* text — 17.7:1 */
--neutral-950: #16161a; /* primary button */

/* Semantic */
--canvas: var(--neutral-100);
--surface: var(--neutral-0);
--surface-muted: var(--neutral-50);
--surface-hover: #f7f7f8; /* row hover on white */
--surface-selected: var(--sky-50); /* selected row */
--sidebar-hover: var(--neutral-150);
--sidebar-active: #ebebed;
--border: var(--neutral-200);
--border-strong: var(--neutral-250);
--text: var(--neutral-900);
--text-secondary: var(--neutral-700);
--text-muted: var(--neutral-600);
--text-placeholder: var(--neutral-500); /* inputs always also have a label */
--text-disabled: var(--neutral-400);
--text-link: var(--sky-700);
--icon: var(--neutral-600);
--icon-strong: var(--neutral-800);

--primary: var(--neutral-950); /* near-black buttons */
--primary-hover: #2a2a30;
--primary-active: #000000;
--on-primary: #ffffff;

--focus: var(--sky-600); /* 4.06:1 — clears 3:1 for focus indicators */
--focus-halo: color-mix(in oklab, var(--sky-400) 28%, transparent);

--danger: #dc2626;
--danger-text: #b91c1c;
--danger-bg: #fef2f2;
--warning: #d97706;
--warning-text: #b45309;
--warning-bg: #fffbeb;
--success: #16a34a;
--success-text: #15803d;
--success-bg: #f0fdf4;
--info: var(--sky-600);
--info-text: var(--sky-700);
--info-bg: var(--sky-50);
```

### 3.4 Tag / label palette

Each hue is a triple: `bg-50 / border-200 / text-700`. The pairs were checked for text-on-bg contrast. Labels, note colours and chart categories store the **token name** (`purple`…`grey`), never a hex value.

| Token    | bg        | border    | text      | text/bg |
| -------- | --------- | --------- | --------- | ------- |
| `purple` | `#FAF5FF` | `#E9D5FF` | `#7E22CE` | 6.5:1   |
| `red`    | `#FEF2F2` | `#FECACA` | `#B91C1C` | 5.9:1   |
| `green`  | `#F0FDF4` | `#BBF7D0` | `#15803D` | 4.8:1   |
| `lime`   | `#F7FEE7` | `#D9F99D` | `#4D7C0F` | 4.8:1   |
| `blue`   | `#EFF6FF` | `#BFDBFE` | `#1D4ED8` | 6.2:1   |
| `amber`  | `#FFFBEB` | `#FDE68A` | `#B45309` | 4.8:1   |
| `pink`   | `#FDF2F8` | `#FBCFE8` | `#BE185D` | 5.5:1   |
| `teal`   | `#F0FDFA` | `#99F6E4` | `#0F766E` | 5.3:1   |
| `orange` | `#FFF7ED` | `#FED7AA` | `#C2410C` | 4.9:1   |
| `grey`   | `#F4F4F5` | `#E4E4E7` | `#52525B` | 7.0:1   |

Pill spec: 24 px tall, radius 8, padding 0 8px, 13/500. A dot variant (6 px) is used where space is tight, such as board cards in compact density. The overflow counter `+N` is plain `--text-muted`, 13/500, with no pill.

### 3.5 Workflow state groups (Plane-style icons)

Icons are 14/16 px circles drawn in SVG on a 16×16 grid with stroke 1.5. States can override the colour; these are the defaults per group.

| Group     | Icon                                                                            | Default colour           |
| --------- | ------------------------------------------------------------------------------- | ------------------------ |
| Triage    | dotted circle with an inner dot                                                 | `--lavender-500 #837DED` |
| Backlog   | **dashed** circle                                                               | `#A1A1AA`                |
| Unstarted | **empty** circle                                                                | `#71717A`                |
| Started   | circle with a **partial pie fill** (the fraction can reflect sub-item progress) | `#D97706`                |
| Completed | filled circle with a **check**                                                  | `#16A34A`                |
| Cancelled | filled circle with an **×**                                                     | `#DC2626` at 80%         |

State icons always appear next to the state name (or with a tooltip in compact cells), so colour never carries meaning alone.

### 3.6 Priority icons

These are three ascending bars, 2.5 px wide with 1.5 px gaps. Unfilled bars use `--neutral-300`.

| Priority | Icon                               | Colour                    |
| -------- | ---------------------------------- | ------------------------- |
| Urgent   | **Filled rounded square with "!"** | `#DC2626` bg, white glyph |
| High     | 3 of 3 bars                        | `#3F3F46`                 |
| Medium   | 2 of 3 bars                        | `#3F3F46`                 |
| Low      | 1 of 3 bars                        | `#3F3F46`                 |
| None     | three dashes `–––`                 | `#A1A1AA`                 |

Only Urgent is coloured, so the colour stands out when it matters.

### 3.7 Typography

- **Font:** Inter variable, self-hosted through `next/font` (no layout shift). Features: `"cv11", "ss01"` (single-storey a, open digits), `font-variant-numeric: tabular-nums` in tables, dates, counters and identifiers.
- **Identifiers** (`INFRA-42`): Inter 13/500 in `--text-muted`, tabular. There's no monospace except in code blocks and agent terminal output (`JetBrains Mono` via `next/font`).

| Token         | Size / line | Weight  | Tracking | Use                                             |
| ------------- | ----------- | ------- | -------- | ----------------------------------------------- |
| `display`     | 24/32       | 600     | -0.015em | Full-page item title, empty-state heroes        |
| `title-lg`    | 20/28       | 600     | -0.012em | Peek panel title, settings page titles          |
| `title`       | 16/24       | 600     | -0.006em | Dialog titles, section headers in panels        |
| `nav`         | 15/20       | 500     | -0.006em | Breadcrumb, large buttons (as in Spott)         |
| `body`        | 14/20       | 400     | -0.003em | Default text, table cells, sidebar items (500)  |
| `body-strong` | 14/20       | 500     | -0.003em | Names, column headers, primary cell text        |
| `small`       | 13/18       | 400/500 | 0        | Secondary cells, chips, pills, meta             |
| `caption`     | 12/16       | 500     | 0        | Sidebar section labels, timestamps, helper text |
| `micro`       | 11/14       | 600     | 0.01em   | Badge counts, `kbd`                             |

Rich text (descriptions, notes, comments) uses body 14/22 with 12 px paragraph spacing, headings at 20/16/15 and 600 weight, and lists indented 20 px.

### 3.8 Spacing, radii, elevation, motion, layering

```css
/* spacing: 4px grid */
--space-0: 0;
--space-0_5: 2px;
--space-1: 4px;
--space-1_5: 6px;
--space-2: 8px;
--space-2_5: 10px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;

/* radii */
--radius-xs: 4px; /* checkbox */
--radius-sm: 6px; /* kbd, tiny badges */
--radius-chip: 8px; /* pills, chips, tags */
--radius-control: 10px; /* inputs, buttons, nav items, menu items */
--radius-card: 12px; /* board cards, popovers, menus, toasts */
--radius-panel: 16px; /* main panel, dialogs, peek panel */
--radius-full: 9999px; /* avatars, status dots */

/* elevation: borders first, shadows only for floating layers */
--shadow-none: none; /* panel: hairline only */
--shadow-xs: 0 1px 2px rgb(16 16 20 / 0.04); /* outlined buttons, inputs */
--shadow-card: 0 1px 2px rgb(16 16 20 / 0.04), 0 1px 1px rgb(16 16 20 / 0.02); /* board cards */
--shadow-popover: 0 8px 24px -6px rgb(16 16 20 / 0.1), 0 2px 6px -2px rgb(16 16 20 / 0.05);
--shadow-dialog: 0 24px 64px -12px rgb(16 16 20 / 0.18), 0 4px 12px -4px rgb(16 16 20 / 0.06);
--shadow-drag: 0 14px 28px -8px rgb(16 16 20 / 0.2);

/* motion */
--ease-out: cubic-bezier(0.2, 0, 0, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--dur-fast: 120ms; /* hover, press, checkbox */
--dur-base: 160ms; /* popovers, menus, tooltips (with 400ms open delay) */
--dur-slow: 200ms; /* peek panel slide, dialog, sidebar collapse */
/* prefers-reduced-motion: transforms off, opacity fades only (≤120ms) */

/* layering */
--z-sticky: 10;
--z-sidebar: 20;
--z-peek: 30;
--z-popover: 50; /* = dialog: portals stack in open order, so pickers inside dialogs show (D-092) */
--z-dialog: 50;
--z-palette: 60;
--z-toast: 70;
--z-tooltip: 80;
```

### 3.9 Sizes

| Token                                     | Value                                                              |
| ----------------------------------------- | ------------------------------------------------------------------ |
| Control height lg / md / sm / xs          | 40 / 36 / 32 / 28 px                                               |
| Icon in nav / control / cell / chip       | 18 / 16 / 16 / 14 px, lucide `strokeWidth={1.75}`                  |
| Avatar xs / sm / md / lg                  | 20 / 24 / 32 / 40 px                                               |
| Row height comfortable / compact          | 52 / 36 px (table and list)                                        |
| Board card min height                     | 76 px comfortable / 56 px compact                                  |
| Sidebar                                   | 248 px (216–320 resizable; collapses to a 56 px rail at < 1024 px) |
| Panel inset                               | 8 px (top/right/bottom), 0 on the sidebar side                     |
| Page header / toolbar                     | 56 / 48 px                                                         |
| Peek panel                                | 560 px (resizable 480 – 60% of the panel)                          |
| Content max width (forms, settings, docs) | 720 px; detail page body 880 px                                    |

### 3.10 Breakpoints

`sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1536`.

Dopl is desktop-first but must work at phone width for triage, approvals, inbox and quick capture:

- Below 768 px, the sidebar becomes a drawer.
- The panel loses its inset and radius.
- Tables switch to list rows.
- The peek panel becomes a full-screen sheet.
- Every screen keeps 16 px side gutters and never scrolls horizontally (except inside the table view).

---

## 4. Layout patterns

### 4.1 App shell

```
┌ canvas (#F5F5F6) ────────────────────────────────────────────────────────────┐
│ ┌ sidebar (on canvas) ┐ ┌ panel (white, r16, 1px border) ───────────────────┐ │
│ │ [mark] Dopl      «  │ │ ▣ Infra › Board ⓘ        [Default ▾][View ▾][+ New]│ │
│ │ [🔍 Search…   ⌘K]   │ ├────────────────────────────────────────────────────┤ │
│ │ ⌂ Home              │ │ [🔍 Search items…] [⇅ Sorted by Updated] [≡ Filters]│ │
│ │ ✉ Inbox        3    │ ├────────────────────────────────────────────────────┤ │
│ │ ✎ Notes             │ │  content (list / board / table / …)                │ │
│ │ 💬 Messages     •   │ │                                                    │ │
│ │ @ Mail              │ │                                                    │ │
│ │ Projects            │ │                                                    │ │
│ │  ▸ INFRA Infra      │ │                                                    │ │
│ │  ▸ NET   Network    │ │                                                    │ │
│ │ Views               │ │                                  ░ bottom fade ░   │ │
│ │ Tools               │ └────────────────────────────────────────────────────┘ │
│ │ ▦ Analytics         │                                                        │
│ │ ⚙ Settings  [avatar]│                                                        │
│ └─────────────────────┘                                                        │
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Sidebar order:**
  1. Logo row, with the workspace switcher prepared for later
  2. Search (opens ⌘K)
  3. **Home, Inbox (badge), Notes, Messages (unread dot), Mail (badge)**
  4. **Projects** (collapsible, per-user order by drag, favourites first), each expanding to its views and intake
  5. **Views** (workspace views)
  6. **Tools**: Analytics, Settings
  7. User menu at the bottom, with an agent status pill when the agent is running or paused
- Counts are `micro` numbers in `--text-muted`. Unread messages show a 6 px sky-600 dot.

### 4.2 Page header and toolbar

- **Left:** the breadcrumb (feature icon, parent, `›`, current page in `nav` weight 500 `--text`), plus an optional ⓘ popover with a description.
- **Right:** secondary outlined buttons (icon + label + chevron) for layout and view settings and import/export, then the **one primary button** ("New item", C), then `⋮` for overflow.
- **Toolbar:** view search (`/`), a sort chip ("Sorted by **Updated**"), the filter chip (showing a count badge when active), the **"Done hidden · 23" toggle chip** (D-053, `⇧H`) and quick-filter chips.
  - Active filters render as removable chips on a second row that only appears when filters exist.
  - Display options live in a popover from "View settings": group by, sub-group, order, properties, density and "show sub-items".

### 4.3 List and table

- **Header row:** checkbox, then per column a lucide icon (14 px, `--icon`), a label (`body-strong`) and a `⋮` menu (sort, hide, move, and "group by this" where applicable).
- **Rows:**
  - Hover is `--surface-hover`. Selected is `--surface-selected` with a sky-600 checkbox.
  - The keyboard-focused row gets a 2 px inset sky-600 left bar plus the hover background, so it's distinguishable from selection.
- **First column:** state icon, identifier (muted), title (`body-strong`), sub-item progress ring, then properties as inline editable **PropertyPills**: priority, assignees stack, labels, due date (red text when overdue) and estimate.
- **Groups:** sticky group headers (state icon + name + count + "+" add). Collapsed state is remembered per view.
- **Table layout:** column resize handles on hover, drag to reorder, the first column pinned, and every cell editable in place (Enter/F2 to edit, Esc to cancel, Tab to move).
- **Virtualization:** TanStack Virtual. Rows have a fixed height per density, so there's no measuring and no jumps.
- **Bottom fade:** a 48 px mask on the scroll container that fades out the last visible rows, matching Spott.

### 4.4 Board

- Columns are 300 px wide on the canvas-tinted panel (`--surface-muted`), with 12 px gaps.
- The header shows the state icon, name, count, `+` and `⋯`.
- **Cards:**
  - white, 1px `--border`, `--shadow-card`, radius 12, 12 px padding
  - identifier + priority on the first line, then the title (2 lines max), then pills (labels, due date, sub-item progress) and the assignee avatars at the bottom right
- **Drag:** the dragged card lifts with `--shadow-drag` and tilts 1.5°. Its drop placeholder has the same height, with a dashed `--border-strong` outline.
- **Swimlanes** (sub-group) are collapsible horizontal bands with a sticky label.

### 4.5 Peek panel and detail page

- **Peek:**
  - slides in from the right _inside_ the main panel, taking the height below the page header
  - 1px border-left and `--shadow-popover` on its left edge
  - The list stays interactive behind it, and `j`/`k` moves the peek to the next or previous item.
- **Layout (shared by peek and full page):**
  - **Top bar:** breadcrumb (project › identifier), then copy-link, open full page (⤢), subscribe (bell), `⋯` and close.
  - **Main column:** title (editable, `title-lg`), description (Tiptap, placeholder "Add a description…"), sub-items (inline list with progress), relations, attachments (drop zone), then the **timeline**.
  - **Properties sidebar** (280 px, full page only; stacked under the title in the peek): state, priority, assignees, labels, type, dates, estimate, parent, project, created/updated (meta).
- **Timeline** merges comments, activity (compact grey single lines: "Ann changed priority to **High** · 2h"), linked email messages (envelope icon, collapsible, "Open thread"), chat references, note references and **agent runs** (lavender-ringed agent avatar, collapsible step list, live output).
  - The comment composer sits at the bottom and is sticky in the peek.

### 4.6 Other layouts

- **Calendar:**
  - A month grid (7 columns) with a week view option.
  - Items are compact pills (state icon + title); "+N more" opens a popover.
  - An **Unscheduled** tray on the right lists undated items and can be dragged onto days.
- **Timeline (Gantt):**
  - The left pane lists items (identifier + title), and the right pane holds the bars. The header has month and week ticks; today is a sky-600 1px line.
  - Bars are 20 px, radius 6, filled with the state-group colour at 18% plus a 1px border in the full colour. They have resize handles on hover and `--shadow-drag` while dragging.
  - Dependency arrows are 1.25 px `--neutral-400` with rounded elbows, and turn danger-coloured when the blocker ends after the blocked item starts.
- **Inbox and Mail:**
  - Two panes: a list (380 px) and a reader.
  - List rows show the avatar, title, preview, time (tabular) and state/assignee pills. Unread rows are bold with a 6 px sky dot.
  - Mail: the open row is `--surface-selected`; opened from the keyboard it also gets the 2 px inset focus bar of §4.3 (a focus ring would be clipped by the list). Ignored threads show only under All, with a muted subject and an "Ignored" caption.
  - Internal email comments render on `--lavender-50` with a lock icon and "Internal note". Email bodies render in a sandboxed iframe with a "Remote images blocked · Load" banner.
- **Notes:**
  - A masonry grid (CSS columns, 280 px cards) with a capture bar on top. The tag tree lives in the secondary sidebar.
  - Cards are white, or tinted with the note's colour (bg-50 + border-200). Pinned notes come first. Checkboxes are interactive right on the card.
- **Public form (`/f/[slug]`):**
  - A centred 560 px white card on the canvas, with the Dopl mark and the project name small at the top, and the form title in `display`.
  - Fields are spaced 20 px apart. The submit button is the near-black primary; "Powered by Dopl" is shown in `caption`.
  - Embed mode drops the canvas and card border.
- **Status page (`/s/[token]`):** the same card language, with a public status timeline and reply box.

---

## 5. Components

Every component lives in `components/ui` (primitives) or `components` (product components). All of them are shown in every state on `/dev/ui` (§8).

| Component                                                             | Variants / states                                                                                                                                                                                                     | Notes                                                                                                  |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Button**                                                            | primary (near-black), secondary (outlined, white), ghost, danger, link; sizes lg/md/sm/xs; icon-only; with leading icon, trailing chevron, `kbd` hint; loading (inline 14 px spinner replaces the icon, width locked) | Focus: 2 px `--focus` outline, 2 px offset                                                             |
| **SplitButton**                                                       | primary + chevron menu                                                                                                                                                                                                | "New item ▾" → templates / types                                                                       |
| **Input / Textarea**                                                  | default, hover, focus (border `--focus` + 3 px `--focus-halo`), invalid (danger border + message), disabled, read-only; with icon, with `kbd` suffix                                                                  | 36 px, radius 10                                                                                       |
| **SearchField**                                                       | sidebar (⌘K hint), toolbar (`/` hint), clear button                                                                                                                                                                   |                                                                                                        |
| **Select / Combobox**                                                 | single, multi (chips), searchable, creatable ("Create label 'x'"), async                                                                                                                                              | cmdk-based lists; typing filters instantly                                                             |
| **PropertyPill**                                                      | state, priority, assignee(s), labels, date, estimate, type, parent; empty ("Set due date" ghost), filled, read-only, overdue                                                                                          | The inline-edit atom used everywhere; opens its picker popover; keyboard shortcut shown in the tooltip |
| **StateIcon / PriorityIcon / TypeIcon**                               | per §3.5 and §3.6; sizes 14/16                                                                                                                                                                                        |                                                                                                        |
| **Avatar / AvatarStack**                                              | image, initials (hashed tag-palette bg), agent (gradient ring), sizes; stack with `+N`                                                                                                                                | Presence dot optional                                                                                  |
| **AgentAvatar**                                                       | idle; **working** (rotating gradient ring, 1.6 s, respects reduced motion); waiting-for-approval (amber dot); paused (grey)                                                                                           | The main brand-gradient moment                                                                         |
| **Tag / Label pill**                                                  | 10 palette tokens; removable; dot variant                                                                                                                                                                             |                                                                                                        |
| **Chip**                                                              | filter chip (property: value ×), link chip (icon + value, as in Spott's email/phone chips), toggle chip                                                                                                               | radius 8, 26–32 px                                                                                     |
| **Checkbox / Radio / Switch**                                         | unchecked, checked (sky-600), indeterminate, disabled, focus                                                                                                                                                          | Checkbox radius 4                                                                                      |
| **SegmentedControl**                                                  | layout switcher (List/Board/Calendar/Table/Timeline icons)                                                                                                                                                            |                                                                                                        |
| **Tabs**                                                              | underline (page sections), pill (in popovers)                                                                                                                                                                         |                                                                                                        |
| **Tooltip**                                                           | text, text + `kbd`                                                                                                                                                                                                    | 400 ms delay, 160 ms fade                                                                              |
| **Kbd**                                                               | single, combo (`⌘` `K`), sequence (`G` then `I`)                                                                                                                                                                      | micro, radius 6, 1px `--border-strong`                                                                 |
| **Menu / ContextMenu**                                                | items with icon, label, `kbd`, submenu, checkable, destructive, separator, section label                                                                                                                              | Right-click on rows and cards opens the same menu as `⋯`                                               |
| **Popover**                                                           | default; with header and footer                                                                                                                                                                                       | white, 1px border, `--shadow-popover`, radius 12                                                       |
| **Dialog**                                                            | default (560), wide (720), confirm (420, destructive variant)                                                                                                                                                         | `--shadow-dialog`, radius 16, overlay `rgb(16 16 20 / 0.24)`                                           |
| **Sheet / PeekPanel**                                                 | right sheet (peek), bottom sheet (mobile)                                                                                                                                                                             |                                                                                                        |
| **CommandPalette**                                                    | root, nested pages, recent, results grouped (items, projects, notes, people, actions)                                                                                                                                 | 640 px, top-third, `--z-palette`                                                                       |
| **Toast**                                                             | info, success, error, **undo** (with countdown bar), loading → success                                                                                                                                                | Bottom-left, stacked, radius 12                                                                        |
| **Banner / Callout**                                                  | info, warning, danger, untrusted-input (amber, shield icon), agent-paused                                                                                                                                             |                                                                                                        |
| **Skeleton**                                                          | text line, avatar, pill, row, card, board column, peek                                                                                                                                                                | Matches real sizes exactly; 1.4 s shimmer (off with reduced motion)                                    |
| **EmptyState**                                                        | per feature: illustration (brand-tinted line art, sparing), title, one sentence, primary action + shortcut                                                                                                            |                                                                                                        |
| **ErrorState**                                                        | inline (retry), section (retry via `catchError` boundary `retry()`), page (404/403/500)                                                                                                                               | Never a blank screen                                                                                   |
| **ProgressRing**                                                      | sub-item progress (sky-600 on `--neutral-200`)                                                                                                                                                                        | 14/16 px                                                                                               |
| **DatePicker**                                                        | single, range, quick options (Today, Tomorrow, Next week, "in 3 days" natural input)                                                                                                                                  |                                                                                                        |
| **RichTextEditor**                                                    | Tiptap: bubble menu, `/` slash commands, `@` mentions, `#` item refs, task lists, code, links, images, paste-to-upload                                                                                                |                                                                                                        |
| **MentionChip / ItemRefChip**                                         | user, agent (lavender), `#INFRA-42` with a hover card (state, title, assignee)                                                                                                                                        |                                                                                                        |
| **Timeline** (activity)                                               | comment, activity line, email, chat ref, note ref, agent run (collapsed/expanded/live)                                                                                                                                |                                                                                                        |
| **ApprovalCard**                                                      | pending (actions: Approve ✓ / Deny ✕ + note), approved, denied, expired; shows host + environment badge, exact command in mono, agent's reason (quoted, "stated by agent"), risk flags                                | Production hosts get a red env badge; a tainted run shows the untrusted banner                         |
| **FilterBuilder**                                                     | rule row (property ▸ operator ▸ value), AND/OR group, nested group, quick filters                                                                                                                                     |                                                                                                        |
| **DisplayOptions**                                                    | group, sub-group, order, toggles, property visibility chips, density                                                                                                                                                  |                                                                                                        |
| **DataTable / VirtualList / BoardColumn / CalendarGrid / GanttChart** | per §4                                                                                                                                                                                                                |                                                                                                        |
| **Chart**                                                             | bar, stacked bar, line, area, donut, number tile                                                                                                                                                                      | §6                                                                                                     |

---

## 6. Charts

- Series colours (`--color-chart-1…8`, D-099): sky-500, amber, pink, lime, lavender-500, orange, purple, teal. This order was checked for colour-blind separation between neighbours; sky next to lavender was not. "None" and "Other" are grey. Red and green are reserved for status.
- Colour follows the entity, never its rank: state groups use the state tokens, states/projects/labels/types their own colour, people their avatar colour, fixed enums (priority, intake status) the series colour for their position.
- Categories (labels, priorities, states) use their own token colours.
- Axes: no axis lines. Ticks are `caption` in `--text-muted`, and grid lines are horizontal `--border` only.
- The tooltip is the standard popover with tabular numbers. The legend sits top-left in `small`.
- Number tiles: the value in `display` (tabular), a delta chip (success/danger text on its bg), and a sparkline in sky-500.

---

## 7. Interaction

### 7.1 Keyboard map (shown in tooltips, menus and `?`)

| Scope            | Keys                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Global           | `⌘K` palette · `C` create item (prefilled from the current view's filters) · `Q` quick note · `/` focus search · `?` shortcuts · `G` then `H` Home, `I` Inbox, `N` Notes, `M` Messages, `E` Mail, `P` projects · `[` toggle sidebar                                                                                                                                 |
| Lists and boards | `J`/`K` or `↑`/`↓` move · `Enter` open peek · `⌘Enter` open full page · `X` select · `⇧`-click range · `⌘A` select all · `A` assign · `⇧A` assign to me · `S` status · `P` priority · `L` labels · `T` type · `D` due date · `E` edit title · `⌘⇧,` copy link · `⌘.` copy identifier · `⇧H` show/hide done items · `⌘⌫` delete (undo toast) · `Esc` clear selection |
| Peek             | `Esc` close · `J`/`K` next/previous item · `M` comment                                                                                                                                                                                                                                                                                                              |
| Create dialog    | `⌘Enter` create · `⌘⇧Enter` create and continue (keeps properties) · pasting multiple lines offers "Create N items"                                                                                                                                                                                                                                                 |
| Mail (Phase 7)   | `J`/`K` or `↑`/`↓` open the next/previous conversation (more load at the end of the list) · `⌫` ignore the open conversation, with an undo toast (D-128)                                                                                                                                                                                                            |
| Intake (Phase 3) | `Y` accept · `N` decline · `U` mark duplicate · `Z` snooze                                                                                                                                                                                                                                                                                                          |
| Approvals        | `⌘⇧Y` approve · `⌘⇧N` deny, with a focus-trapped confirm on production hosts                                                                                                                                                                                                                                                                                        |

Every shortcut goes through one registry (scopes, conflict detection and platform glyphs ⌘/Ctrl). It's disabled while typing in inputs, except for `Esc` and `⌘` combos.

### 7.2 Feedback and motion

- **Optimistic by default:** the UI updates on keydown or click. Failures roll back and show an error toast with Retry.
- **Destructive actions** use an undo toast (5 s) instead of confirm dialogs, except for irreversible ones (disconnecting a mailbox, deleting a project), which use a typed confirm.
- **Durations:** hover and press 120 ms, popovers 160 ms (with a 4 px slide), peek and dialog 200 ms. No bounce and no spring overshoot.
- **Realtime changes** from other users flash the changed field with a 600 ms `--sky-50` background fade, never a layout shift.

### 7.3 Content and voice

- Sentence case everywhere: "View settings", not "View Settings". The Spott reference uses title case on some buttons; we don't.
- Verbs on buttons: "Create item", "Accept", "Approve command".
- Numbers use tabular figures. Relative times show "2h" or "Yesterday", with the absolute time in the tooltip.
- The agent speaks in the first person, briefly, and never hides uncertainty. Its identity is the gradient-ringed mark. "Dopl" is the teammate's default name (Q-13).

### 7.4 Accessibility

- Contrast: text meets AA (≥ 4.5:1) everywhere, including muted text on the canvas (4.85:1). UI components and focus indicators are ≥ 3:1. Placeholders are supplementary, and every input has a visible or `aria` label.
- Focus is always visible (`:focus-visible`). Roving tabindex in lists and grids; `aria-activedescendant` in comboboxes and the palette.
- Radix primitives provide dialog, menu and popover roles. Custom widgets (board, gantt, calendar) implement keyboard drag: **Space** to pick up, arrows to move, **Space** to drop, **Esc** to cancel. Changes are announced through a live region.
- Colour is never the only signal: state and priority icons come with text or a tooltip, and overdue dates also get an icon.
- `prefers-reduced-motion` is respected, and the whole UI works at 200% zoom.

---

## 8. `/dev/ui` and the design review loop

- `/dev/ui` is only available in dev and preview builds. It renders every component in every state from §5, plus pattern pages: shell, header, toolbar, list (both densities), board, peek, calendar, gantt, inbox, mail reader, notes grid, public form, and the empty, loading and error states.
- **For each UI task:**
  1. Build it.
  2. Run the app.
  3. Take Playwright screenshots (1440×900, plus 390×844 where relevant).
  4. Compare them side by side with `spott-reference.png`. Check alignment (baselines, icon centring), spacing rhythm (4 px grid), type sizes and weights, border weights and colours, and radius consistency.
  5. Fix, and repeat.
  6. Save the final screenshots to `docs/screenshots/phase-N/`.
- Playwright `toHaveScreenshot` baselines cover `/dev/ui` sections, so visual regressions fail CI.

---

## 9. Token file skeleton (`globals.css`)

```css
@import "tailwindcss";
@import "tw-animate-css";

@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;

  /* brand + scales (§3.1–3.2) */
  --color-brand-lavender: #ada8ff;
  --color-brand-sky: #42b0ff;
  --color-lavender-50: #f6f6ff; /* … 100–900 per table */
  --color-sky-50: #f0f8ff; /* … 100–900 per table */

  /* neutrals + semantic (§3.3) → exposed as utilities: bg-canvas, bg-surface,
     border-border, text-muted, … */
  --color-canvas: #f5f5f6;
  --color-surface: #ffffff;
  --color-border: #ececee;
  --color-border-strong: #e2e2e5;
  --color-text: #18181b;
  --color-text-muted: #6b6b73;
  --color-primary: #16161a;

  /* tag palette (§3.4) as --color-tag-{name}-{bg|border|text} */

  --radius-chip: 8px;
  --radius-control: 10px;
  --radius-card: 12px;
  --radius-panel: 16px;

  --shadow-popover: 0 8px 24px -6px rgb(16 16 20 / 0.1), 0 2px 6px -2px rgb(16 16 20 / 0.05);
  --ease-out: cubic-bezier(0.2, 0, 0, 1);
}

/* Future dark mode: redefine the semantic layer only. */
:root[data-theme="dark"] {
  /* --color-canvas: …; --color-surface: …; */
}
```
