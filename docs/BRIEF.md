# Project Brief: Chalkline (Architecture Diagramming App)

Last updated: 30 Sep 2026

## 1. Purpose

**Chalkline**, tagline "Ideas to diagrams." A personal, fun build project: a modern, sleek, responsive web app for drawing architecture diagrams and whiteboard-style models, in the spirit of draw.io but tuned to my own workflow. It should work well on phone, tablet and laptop, be fully static (no backend), and later gain optional AI features.

## 2. Goals

- Boxes, shapes, connectors, and annotations (notes) on every node and edge
- Colour and style options (fill, border, text, line style, arrowheads)
- Save/load as JSON that diffs cleanly in git; export to PNG, SVG and PDF
- Responsive and touch-friendly, with light and dark themes
- Ship in small phases, each usable on its own
- AI features (text-to-diagram, summaries, review) added last, with tight control of token use

## 3. Non-goals

- Matching every draw.io feature or its smart connector routing
- Real-time multi-user collaboration
- Any backend, accounts or server-side storage (for now)
- Professional-grade precision editing on a phone (phone is for viewing, small edits, quick sketches)
- Organisation-specific content. Examples and fixtures stay generic (for instance a generic multi-tier financial services architecture).

## 4. Decisions made so far

| Area | Decision |
|---|---|
| Name | Chalkline. Repo/package `chalkline`, display name Chalkline. A chalk line is the builder's tool for snapping a straight guide line, which fits connectors and structure |
| Canvas | React Flow (`@xyflow/react`), chosen because architecture diagrams are graphs of nodes and edges |
| Stack | Vite, React, TypeScript (strict), Zustand, Zod, Tailwind, shadcn/ui (Radix), Lucide, Inter (self-hosted), Vitest |
| Backend | None. Static site only |
| Persistence | Browser storage for autosave, plus JSON import/export. Storage is per-origin, so JSON export is the backup and migration path |
| Source control | Git (GitHub, `kishore510/chalkline`). One branch per phase, never commit to `main` directly |
| Hosting | GitHub Pages via GitHub Actions for now (public repo, https://kishore510.github.io/chalkline/), with `VITE_BASE` env var for the base path. Portal hosting (e.g. Cloudflare Pages) is a later decision. No host-specific code |
| Dev environment | Raspberry Pi 5 (64-bit arm64 Linux), VS Code, Claude Code extension. No local browser testing |
| Testing | `tsc --noEmit`, Vitest, `vite build` locally. Visual testing on phone and laptop via the deployed URL |
| Schema | Zod schema is the single source of truth, versioned with migrations. Colours are hex or `token:name` so diagrams follow themes |
| Design | Chalk-on-slate theme direction (slate dark mode, paper light mode). Design tokens (CSS variables), light and dark from day one, mobile-first, pointer events, 44px touch targets, quiet chrome so the canvas is the focus |
| AI (Phase 6) | Bring-your-own-key or a thin Cloudflare Worker proxy, decided when hosting is decided. Explicit buttons only, compact JSON payloads, size estimate before sending |

## 5. Phases and status

| Phase | Scope | Status |
|---|---|---|
| 0. Foundations | Scaffold, `VITE_BASE`, Pages workflow, zod schema, fixtures and tests, design tokens, light/dark, static style-sheet page | Done, merged to `main` and deployed |
| 1. Core canvas | React Flow canvas, palette (rectangle, rounded, database, cloud, actor, text), tap or drag to add, editable labels, resize, connectors, multi-select, delete, snap-to-grid, Zustand store, adaptive layout | Done, merged to `main` and deployed |
| 2. Styling and annotations | Properties panel, edge styles and labels, notes on every node and edge, colour presets | Done, merged to `main` and deployed |
| 3. Persistence and export | Autosave, JSON open/save, PNG/SVG/PDF export, undo/redo, copy/paste, duplicate | Not started |
| 4. Structure | Groups, swimlanes, layers, alignment, auto-layout (ELK or dagre), stencil library | Not started |
| 5. Polish | Shortcuts, search, read-only share view, PWA, optional `.drawio` import | Not started |
| 6. AI | Text-to-diagram, summary, annotation suggestions, review assistant | Not started |

Update this table at the end of each thread.

## 6. Definition of done (every phase)

- `npx tsc --noEmit`, `npm test` and `npm run build` all pass
- Store state always validates against the schema
- Works at 360, 768 and 1280px in light and dark themes, no horizontal page scroll
- Primary actions reachable by touch alone
- No hard-coded colours or sizes outside the token file
- Any schema change has a version bump and a migration with a test
- Short summary of what was built and left out, then stop for review

## 7. Key artefacts

- `CLAUDE.md` (repo root): rules for Claude Code. Source of truth for working rules in the repo.
- `docs/BRIEF.md`: this brief.
- `src/schema/diagram.ts`: zod schema, types, migration and parse helpers.
- `src/fixtures/`: sample diagrams used by tests (tiny, realistic multi-tier, one deliberately invalid).

If the brief and `CLAUDE.md` ever disagree, `CLAUDE.md` wins for code work, and this brief should then be corrected.

## 8. Working agreement for chats in this project

- I build with Claude Code in VS Code on the Pi. Chats here are for planning, design decisions, drafting prompts for Claude Code, reviewing code or diffs I paste in, and debugging.
- Prefer concrete output: prompts I can paste into Claude Code, file contents, checklists.
- Keep phases separate. Don't pull later-phase scope into an earlier phase unless I ask.
- Flag when a suggestion would change the schema, the stack or `CLAUDE.md`, and say which files need updating.
- Be honest about uncertainty on ARM Linux edge cases and library versions rather than guessing.
- Keep the app generic: no organisation-specific details in examples, fixtures or docs.
- Respect the token-use principle for AI features: explicit actions, compact context, cheapest adequate model.

## 9. Open questions

- Availability check for the name Chalkline (npm, domain or portal subdomain, existing products) still to do. GitHub repo `kishore510/chalkline` is taken by us.
- Visual identity details: accent colour and logo (Phase 0 ships a blue accent and a hand-drawn two-box mark as placeholders)
- Portal hosting decision, and with it the Phase 6 key-handling approach (BYO key versus Worker proxy)
- Which stencil/icon sets to include in Phase 4
- Whether `.drawio` import is worth doing in Phase 5

Resolved: public repo on GitHub Pages (30 Sep 2026).

## 10. Session log

Add one line per thread: date, phase, what was decided or built, what's next.

- 30 Sep 2026: Scoped the project, agreed phases, drafted `CLAUDE.md` and zod schema. Next: run Phase 0 in Claude Code.
- 30 Sep 2026: Chose the name Chalkline. Updated brief, `CLAUDE.md` and project instructions. Next: check name availability, then run Phase 0.
- 30 Sep 2026: Phase 0 built (tokens with contrast tests, schema v1 with style/notes/groups, fixtures, style-sheet page, CI and Pages deploy). Public repo created, merged to `main`, live on Pages. Next: Phase 1 core canvas.
- 30 Sep 2026: Phase 1 built (React Flow canvas, tap/drag palette, inline labels, resize, connectors incl. drop-on-node, box/shift multi-select, delete, snap, long-press menu, phone/tablet/desktop layouts, example diagram). Next: review on phone and laptop, then Phase 2.
- 30 Sep 2026: Phase 2 built (7 theme-aware colour presets + custom hex, node fill/border/text/width/size, edge line shape/arrows/dash/colour/width, edge labels, notes with canvas badge, multi-select styling, reset). No schema change. Next: review, then Phase 3.
- 30 Sep 2026: Phase 2 follow-up on `phase-2-styling`: Select/Pan/Link modes (tap source then target), touch hides handle-drag, delete separated from Link with "Deleted. Undo" toast, phone sheet hides toolbar and pans selection into view, floating edges on nearest sides, panel polish. No schema change.
- 30 Sep 2026: Edge connection sides: Start/End side (Auto, Top, Right, Bottom, Left) and Reset to auto; pinned sides stay put as shapes move. No schema change. Drag-to-reattach deferred.
- 30 Sep 2026: Label rendering fix: label layout separate from outline, actor label zone below the figure, free-width actor/text labels, wrap at spaces only, nodes grow to fit labels, 15px default and 14px touch minimum font, actor default 96x128, label-cases fixture (#/fixture/label-cases). No schema change.
- 30 Sep 2026: Connector docking-point editing: end grips on a selected connector (Select mode), drag to a docking point to pin or move to another node, tap for Reset to auto, pin indicator; reconnectEdge store action. All connectors now render via FloatingEdge (fixes a gap where pinned ends stopped short of the shape). No schema change.
- 30 Sep 2026: Obstacle-aware routing for Auto connector ends (pure routeEdge + incremental route cache; other side pairs, then detours; pinned ends untouched). No schema change.
