# CLAUDE.md

Project: **Chalkline**, tagline "Ideas to diagrams." A modern, responsive diagramming / architecture whiteboard web app (a lightweight draw.io alternative). Static front end only, no backend.

- Repo and package name: `chalkline` (lowercase). Display name: Chalkline.
- Use the display name in the UI header, `<title>`, and the PWA manifest (Phase 5).

## How to work in this repo

1. **One phase at a time.** Build only the phase you are asked to build (see "Phases"). When its done-criteria are met, **stop and wait for review**. Do not start the next phase.
2. **One branch per phase**, e.g. `phase-1-canvas`. Never commit directly to `main`.
3. **Store and schema first, UI second.** Write logic and tests before components.
4. **Ask before adding dependencies** that are not listed in "Stack".
5. Keep changes small and commit often with clear messages.

## Stack

- Vite + React + TypeScript (strict mode)
- `@xyflow/react` (React Flow) for the canvas
- Zustand for state
- Zod for the diagram schema (single source of truth for types)
- Tailwind CSS + shadcn/ui (Radix primitives) + Lucide icons
- Inter font, self-hosted (no CDN requests)
- Vitest for tests
- ELK or dagre for auto-layout (Phase 4 only)

## Environment constraints

- Development machine is a Raspberry Pi 5: **arm64 Linux, 64-bit**.
- Node version is pinned in `.nvmrc`. Do not change it without asking.
- **No browser is available locally.** Do not add Playwright, Cypress, Puppeteer or any browser-automation dependency.
- Verification is: `npx tsc --noEmit`, `npm test`, and `npm run build`. All three must pass before a phase is considered done.
- Prefer lightweight tooling. Avoid anything with heavy native builds.
- The developer tests visually on a phone and laptop via the deployed GitHub Pages URL.

## Hosting and build

- Deploy target for now: **GitHub Pages** via GitHub Actions on push to `main`.
- Vite `base` comes from the `VITE_BASE` environment variable, defaulting to `/`.
- Output must be plain static files. **No host-specific code**, so it can move to another host later.
- If routing is ever needed, use **hash routing**.
- No secrets in the repo. AI features (Phase 6) are out of scope until the key-handling decision is made.

## Architecture rules

- The diagram is a **JSON document defined by the zod schema** in `src/schema/diagram.ts`. Types are inferred from it. Do not hand-write duplicate types.
- The Zustand store holds the diagram in exactly the schema's shape. React Flow renders from the store and writes changes back to it.
- The store's diagram state must **always pass schema validation**.
- **Every schema change requires** a `schemaVersion` bump and a migration function with a test. Old saved diagrams must keep loading.
- Persistence (Phase 3) is browser storage plus JSON file import/export. Browser storage is per-origin, so JSON export is the migration and backup path.
- Fixtures live in `src/fixtures/` and are used by tests. Keep them valid against the current schema.

## Design system

- All styling goes through **design tokens** (CSS variables) defined in one file. No hard-coded colours, radii, spacing or font sizes elsewhere.
- **Light and dark themes are both required** from Phase 0, and both must pass a contrast check.
- Theme direction: chalk on slate. Dark mode is a deep slate blackboard with soft chalk-white lines; light mode is a clean paper look. Optional subtle hand-drawn accent (for example the logo and empty-state illustration) but the canvas itself stays crisp and precise.
- Look and feel: modern, sleek, quiet chrome so the canvas is the focus. Generous whitespace, soft shadows, 8 to 12px radii, a restrained neutral palette with one accent colour, subtle transitions.
- New nodes must look good with **no styling applied** (sensible defaults).
- Provide clear empty states, obvious selection states and immediate feedback on drag and connect.

## Responsive and touch rules

- **Mobile-first.** Build the phone layout first, then enhance for tablet and desktop.
- Check every phase at **360px, 768px and 1280px** wide: no horizontal page scroll, nothing cut off.
- Layout by breakpoint:
  - Phone: bottom drawer for the palette, bottom sheet for properties, floating thumb-reachable toolbar.
  - Tablet: collapsible side rail, slide-over properties.
  - Desktop: persistent left palette, persistent right properties panel, top bar with shortcuts.
- Use **pointer events**, not mouse events.
- **Minimum 44px touch targets.** Keep visible handles small by using invisible padding for the hit area.
- No hover-only interactions. Keyboard shortcuts are a bonus and never the only route to a feature.
- Provide an explicit select/move versus pan tool toggle for touch.
- Use `dvh` units and safe-area insets. Set `touch-action` on the canvas and prevent page-level pinch and pull-to-refresh there.
- Long-press replaces right-click on touch.
- Expectation: phone is for viewing, small edits and quick sketches. Laptop and tablet are for serious modelling.

## Phases

Each phase is shippable on its own.

- **Phase 0, Foundations:** repo scaffold, `VITE_BASE`, GitHub Pages workflow, zod schema, fixtures with validation tests, design tokens, light/dark themes, a static "style sheet" page showing buttons, panels, each node shape and both themes.
- **Phase 1, Core canvas:** React Flow canvas, pan/zoom/minimap/controls, node palette (rectangle, rounded box, database, cloud, actor, text), drag or tap to add, editable labels, resize, connectors with arrowheads, multi-select, delete, snap-to-grid toggle, Zustand store, adaptive layout. **Out of scope:** colours, edge styles, notes, save/load, undo/redo, groups.
- **Phase 2, Styling and annotations:** properties panel (fill, border, text colour, font size), edge styles and labels, notes field on every node and edge, colour presets.
- **Phase 3, Persistence and export:** autosave, JSON open/save, PNG/SVG/PDF export, undo/redo, copy/paste, duplicate.
- **Phase 4, Structure:** groups and swimlanes, layers, alignment and distribution, auto-layout, stencil/template library.
- **Phase 5, Polish:** keyboard shortcuts, search, read-only share view (URL hash), PWA install, optional `.drawio` import.
- **Phase 6, AI (bring-your-own-key or thin Worker proxy):** text-to-diagram, diagram summary, annotation suggestions, review assistant. Every AI action is an explicit button, never automatic. Show an estimated payload size before sending. Send compact JSON, not screenshots. Allow a selected subset of nodes as context.

## Definition of done (every phase)

- [ ] `npx tsc --noEmit` passes
- [ ] `npm test` passes
- [ ] `npm run build` passes
- [ ] Store state validates against the schema
- [ ] Works at 360, 768 and 1280px in light and dark themes
- [ ] Primary actions reachable by touch alone
- [ ] No hard-coded colours or sizes outside the token file
- [ ] Any schema change has a version bump and migration
- [ ] Short summary of what was built and what was left out, then **stop for review**
