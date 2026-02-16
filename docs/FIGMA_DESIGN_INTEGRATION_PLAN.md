# Figma Design Integration Plan

**Goal:** Align the FuelSense app’s visuals with Figma (design, borders, sizes, color theme, component dimensions). Agent capabilities, APIs, and business logic stay unchanged.

**Figma design source (FUEL-SENSE-VXD):**

- **File:** [Figma: FUEL-SENSE-VXD](https://www.figma.com/design/f0UAeYid01dSJu8LVnaT6O/FUEL-SENSE-VXD)
- **Main frame node-id:** `9140-67960` (use with Figma MCP: “get design context” / “get variables” for this node)
- **Embed (for docs/Notion):** use the iframe below to reference the design.

```html
<iframe style="border: 1px solid rgba(0, 0, 0, 0.1);" width="800" height="450" src="https://embed.figma.com/design/f0UAeYid01dSJu8LVnaT6O/FUEL-SENSE-VXD?node-id=9140-67960&m=dev&embed-host=share" allowfullscreen></iframe>
```

**Prerequisites:** Builder.io is authenticated. Use the file link and node-id above with Figma MCP or export design tokens from this frame.

---

## 1. Design token and theme (single source: Figma)

**Objective:** One place for colors, spacing, radius, and typography that matches Figma.

| Area | Current state | Planned change |
|------|----------------|----------------|
| **Colors** | [globals.css](frontend/app/globals.css): `:root` / `.dark` use oklch + FuelSense hex vars (`--fs-brand`, `--fs-sidebar`, etc.) | Replace or extend with values from Figma (e.g. via Builder.io sync or manual token export). Add any missing semantic tokens (e.g. chat bubble, message border, tab active state) so components use variables instead of raw hex/teal/gray. |
| **Borders** | Mixed: some `border-border`, many hardcoded `border-gray-200`, `border-teal-*` in [chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) | Define Figma border width(s) and color token(s) in `globals.css` (e.g. `--fs-border-width`, `--fs-border`). Use these in base layer and components. |
| **Radius** | `--radius: 0.625rem`; components use `rounded-md`, `rounded-xl`, etc. | Align radius scale to Figma (e.g. sm/md/lg/xl). Keep or add `--radius-*` in `@theme` so Tailwind and components stay consistent. |
| **Spacing / sizes** | Ad hoc (e.g. `py-6`, `px-6`, `gap-2`, `h-9`) | Introduce a small spacing/size scale from Figma (e.g. component padding, icon sizes, input height) and apply via CSS variables or Tailwind theme so buttons, inputs, cards, and chat UI use the same numbers as Figma. |

**Files to touch:**

- **[frontend/app/globals.css](frontend/app/globals.css)**  
  - Add or overwrite CSS custom properties for:  
    - Figma color palette (and dark mode if applicable).  
    - Border width and color.  
    - Radius scale.  
    - Optional: spacing/size scale (e.g. `--fs-space-2`, `--fs-input-h`).  
  - Keep existing semantic names where they still match Figma (e.g. `--fs-brand`, `--fs-sidebar`); only change the values to match Figma.  
  - Ensure `@theme inline` maps these into Tailwind (e.g. `--color-fs-*`, `--radius-*`) so you can use `bg-fs-surface`, `rounded-lg`, etc.

- **[frontend/tailwind.config.ts](frontend/tailwind.config.ts)** (optional)  
  - If you add new token names that Tailwind should expose (e.g. `fs-surface`, `fs-border`), extend `theme.extend.colors` / `borderRadius` to point at the new variables. With Tailwind v4 and `@theme inline`, most of this can stay in CSS only.

**Out of scope:** No changes to agent logic, API routes, or state.

---

## 2. Color theme (replace hardcoded colors)

**Objective:** No raw gray/teal/blue/green in UI; everything goes through theme variables.

| Location | Current | Change |
|----------|--------|--------|
| [app/page.tsx](frontend/app/page.tsx) | `bg-gray-50 dark:bg-gray-900` | Use theme tokens (e.g. `bg-fs-surface` or `bg-background` set from Figma). |
| [chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) | Many `text-gray-*`, `bg-gray-*`, `border-gray-*`, `teal-*`, `green-*`, `blue-*` | Replace with semantic tokens (e.g. `text-foreground`, `text-muted-foreground`, `bg-fs-surface`, `border-fs-border`, `bg-fs-brand`, etc.) so light/dark and future tweaks come from one place. |
| Message bubbles, Sense AI intro, tabs, “Possible next actions” footer | Gradient and border classes (e.g. `from-teal-500 to-green-500`, `border-teal-400`) | Map to Figma-approved tokens (e.g. `--fs-brand`, `--fs-brand-light`, `--fs-green` or new “message border” / “avatar gradient” tokens). |
| Template response / cards | [TemplateResponseContainer.tsx](frontend/components/template-response/TemplateResponseContainer.tsx), section components | Use same semantic colors (e.g. `text-foreground`, `border-fs-border`) instead of raw gray. |

**Files to touch:**

- [frontend/app/globals.css](frontend/app/globals.css) – token values from Figma.
- [frontend/app/page.tsx](frontend/app/page.tsx) – shell background.
- [frontend/components/chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) – replace all hardcoded color classes with theme-based ones.
- [frontend/components/template-response/TemplateResponseContainer.tsx](frontend/components/template-response/TemplateResponseContainer.tsx) and any section/alert components – same replacement.
- Other UI that uses raw Tailwind colors (e.g. [components/ui/alert.tsx](frontend/components/ui/alert.tsx)) – switch to theme tokens where Figma defines them.

**Out of scope:** No changes to when/how components render (e.g. agent flow, visibility logic).

---

## 3. Borders (width and color)

**Objective:** All borders use Figma width and color.

| Item | Current | Change |
|------|--------|--------|
| Base | `@apply border-border` in globals | Keep or replace `--border` with Figma border color; add `--fs-border-width` if Figma specifies (e.g. 1px). |
| Cards | [card.tsx](frontend/components/ui/card.tsx): `rounded-xl border` | Use theme border color and radius from Figma. |
| Inputs | [input.tsx](frontend/components/ui/input.tsx): `border` | Same. |
| Chat message bubbles | Thick multi-side borders in chat interface | Replace with Figma-specified border width and color tokens. |
| Badges, alerts, separator | Various `border` classes | Use shared border token(s). |

**Files to touch:**

- [frontend/app/globals.css](frontend/app/globals.css) – define `--fs-border`, optional `--fs-border-width`.
- [frontend/components/ui/card.tsx](frontend/components/ui/card.tsx), [input.tsx](frontend/components/ui/input.tsx), [badge.tsx](frontend/components/ui/badge.tsx) – use theme border (and radius if needed).
- [frontend/components/chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) – message and section borders use tokens.

**Out of scope:** No structural or behavioral changes to components.

---

## 4. Component sizes (from Figma)

**Objective:** Buttons, inputs, cards, avatars, and chat chrome use Figma dimensions.

| Component | Current | Change |
|-----------|--------|--------|
| **Button** | [button.tsx](frontend/components/ui/button.tsx): h-9/8/10, px-4/3/6, icon size-9/8/10 | Set heights and padding from Figma (e.g. 32/36/40px), optionally via CSS vars (e.g. `--fs-btn-h-md`) and same for icon. |
| **Input** | [input.tsx](frontend/components/ui/input.tsx): h-9, px-3 | Match Figma input height and horizontal padding. |
| **Card** | [card.tsx](frontend/components/ui/card.tsx): `gap-6`, `py-6`, `px-6` (CardContent, etc.) | Align padding and gap to Figma card spec. |
| **Badge** | [badge.tsx](frontend/components/ui/badge.tsx): `px-2 py-0.5`, `text-xs` | Match Figma badge size/padding if different. |
| **Chat UI** | Avatar `w-7 h-7`, bubble padding `px-3 py-2`, input area, sidebar width | Read sizes from Figma (avatar, message padding, input bar height, sidebar width) and apply via Tailwind or CSS vars. |
| **Charts / tables** | Various fixed heights and paddings | Where Figma specifies, use the same spacing/sizes (no change to data or agent-driven content). |

**Files to touch:**

- [frontend/app/globals.css](frontend/app/globals.css) – optional size variables (e.g. `--fs-input-h`, `--fs-avatar-size`).
- [frontend/components/ui/button.tsx](frontend/components/ui/button.tsx), [input.tsx](frontend/components/ui/input.tsx), [card.tsx](frontend/components/ui/card.tsx), [badge.tsx](frontend/components/ui/badge.tsx) – class names or style props updated to Figma values only.
- [frontend/components/chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) – avatar size, message padding, input bar, sidebar width from Figma.
- [frontend/components/template-response/*](frontend/components/template-response/) – section spacing and text sizes to match Figma if defined.
- Chart wrappers (e.g. [charts/speed-consumption-chart.tsx](frontend/components/charts/speed-consumption-chart.tsx)) – only container size/padding if Figma specifies; no change to Recharts logic or data.

**Out of scope:** No changes to component behavior, props, or agent-driven rendering logic.

---

## 5. Typography (optional but recommended)

**Objective:** Font family, sizes, and weights match Figma.

| Item | Current | Change |
|------|--------|--------|
| Fonts | [layout.tsx](frontend/app/layout.tsx): Inter + Poppins, `--font-inter` / `--font-poppins` | If Figma uses different families, add and use them; keep fallbacks. |
| Scale | Mix of `text-xs`, `text-sm`, `text-lg`, `font-semibold`, etc. | Align to Figma type scale (e.g. body, caption, heading sizes and weights). Prefer theme or utility classes (e.g. `text-fs-body`) so one change updates the app. |

**Files to touch:**

- [frontend/app/layout.tsx](frontend/app/layout.tsx) – font loading if Figma fonts differ.
- [frontend/app/globals.css](frontend/app/globals.css) – optional type scale (e.g. `--fs-text-body`, `--fs-text-caption`).
- [frontend/components/chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) and template sections – replace raw `text-sm`/`text-xs` with semantic classes where Figma defines a type style.

**Out of scope:** No copy or content changes beyond styling.

---

## 6. What will not change

- **Agent pipeline:** Multi-agent graph, routing, tool calls, API routes (e.g. `app/api/chat-multi-agent/route.ts`).
- **State and data:** Message state, analysis data, hull charts, structured response handling.
- **Rendering logic:** When to show map, charts, tables, template vs hybrid renderer; feature flags; component registry and `COMPONENT_MAP`.
- **Behavior:** Form submit, streaming, error handling, “Possible next actions” (only their look, not presence or wiring).
- **Backend and integrations:** No changes outside the frontend styling and theme.

---

## 7. Suggested order of work

1. **Get Figma specs** – Export or document from Figma: colors (light/dark), border width/color, radius scale, spacing/sizes for buttons, inputs, cards, chat (avatar, bubble, sidebar, input bar), and typography.
2. **Tokens in CSS** – Update [globals.css](frontend/app/globals.css) (and optionally [tailwind.config.ts](frontend/tailwind.config.ts)) with those tokens.
3. **Theme and borders** – Replace hardcoded colors and borders in [chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) and [page.tsx](frontend/app/page.tsx).
4. **UI primitives** – Align [button](frontend/components/ui/button.tsx), [input](frontend/components/ui/input.tsx), [card](frontend/components/ui/card.tsx), [badge](frontend/components/ui/badge.tsx) (and other [ui/](frontend/components/ui/) components) to Figma sizes and borders.
5. **Template and charts** – Apply tokens and sizes to template response and chart containers.
6. **Typography** – If desired, align font and type scale in layout and key components.

---

## 8. Summary of files to change

| File | Changes |
|------|--------|
| [frontend/app/globals.css](frontend/app/globals.css) | Figma design tokens (colors, borders, radius, optional spacing/size and type scale). |
| [frontend/app/page.tsx](frontend/app/page.tsx) | Shell background to theme token. |
| [frontend/app/layout.tsx](frontend/app/layout.tsx) | Fonts only if Figma specifies different ones. |
| [frontend/tailwind.config.ts](frontend/tailwind.config.ts) | Optional: extend theme with new token refs. |
| [frontend/components/chat-interface-multi-agent.tsx](frontend/components/chat-interface-multi-agent.tsx) | Colors, borders, sizes (avatars, bubbles, tabs, footer, input area) from tokens. |
| [frontend/components/ui/button.tsx](frontend/components/ui/button.tsx) | Sizes and borders from Figma. |
| [frontend/components/ui/input.tsx](frontend/components/ui/input.tsx) | Height, padding, border from Figma. |
| [frontend/components/ui/card.tsx](frontend/components/ui/card.tsx) | Padding, gap, border, radius from Figma. |
| [frontend/components/ui/badge.tsx](frontend/components/ui/badge.tsx) | Padding, border, optional size from Figma. |
| [frontend/components/ui/alert.tsx](frontend/components/ui/alert.tsx) | Colors/borders from theme if Figma defines alerts. |
| [frontend/components/template-response/TemplateResponseContainer.tsx](frontend/components/template-response/TemplateResponseContainer.tsx) and section components | Semantic colors and spacing. |
| Chart components (e.g. under [frontend/components/charts/](frontend/components/charts/)) | Container dimensions/padding only if specified in Figma. |
| Other [frontend/components/ui/*](frontend/components/ui/) and feature components | Any remaining raw color/border/size replaced with tokens. |

All of the above are visual-only; agent capabilities and app functionality remain as they are.
