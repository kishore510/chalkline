# Changelog

All notable changes to Chalkline are listed here, newest first. The format follows Keep a Changelog, and versions follow the project convention: 0.x, a minor bump for each merged slice and a patch bump for each follow-up fix.

## [0.21.0] - 2026-10-01

### Added
- **AI in Settings (bring your own key)**: add your own Anthropic API key, choose where it's kept, test it, and remove it. This release sets up the key only; AI actions on diagrams come later.
- **This session only** (the default) keeps the key in memory until you reload or close the tab. **Remember on this device** keeps it in this browser, after a clear warning. Switching moves the key and removes it from the other place.
- **Test key** checks your key with a free one-word request, and the status line shows whether it worked.
- Before anything is sent, a check step shows the model, what's included and the estimated size, with **Send** and **Cancel**. The first time, it also reminds you that what you send leaves this device.
- Plain messages when a request fails (wrong key, rate limits with the wait time, the service busy, a blocked network), with **Retry**. Chalkline never retries on its own.
- A Help topic on AI features and keeping your key safe, and more troubleshooting help.

### Changed
- Your key is never included in backups, diagram files, stencil exports or error details, and **Clear local data** removes it.

## [0.20.0] - 2026-10-01

### Added
- **Settings**: theme, snap to grid, smart guides, grid display, the arrowhead for new connectors, and the font and label size new diagrams start with. Open it from the gear at the top, or from the menu on a phone. Changes apply straight away.
- **Export everything**: one backup file with your diagram, stencil library and settings. **Import backup** checks the file and shows what it will replace before anything changes.
- **Clear local data**: removes everything Chalkline keeps in this browser, after offering to export a backup first.
- Settings also shows roughly how much browser storage Chalkline uses.
- A welcome on your first visit, with a template or a sample diagram to start from, and a short tour of the Select, Pan and Link modes. Replay the tour from Settings or Help.
- A Help topic on settings, backup and the tour, and more troubleshooting help.

### Changed
- Clearer messages when something goes wrong, each with what to do next and a **Details** toggle. A file that won't open never replaces your current diagram, and a diagram from a newer version is refused rather than half-loaded.
- If autosave fails because storage is full or blocked, a banner says so and offers **Export JSON now**. Chalkline tries again on your next change.
- An autosave that can't be read is kept aside, so you can export it, instead of being lost. One from a newer version is left untouched.
- If a diagram can't be drawn, you get a way out (export it, or start a new one) instead of a blank screen.
- Your existing theme, view, panel and arrange choices move into the new settings automatically.

## [0.19.1] - 2026-10-01

### Fixed
- Shape icons in the palette now match the mark drawn inside the shape on the canvas. For example, Firewall shows its brick wall, Agent identity its ID card and Prompt template its braces, in the palette and the properties header alike. This covers the networking, architecture and AI & ML shapes added in Shapes pack 2.

## [0.19.0] - 2026-10-01

### Added
- Keyboard use of the canvas. Tab and Shift+Tab move between shapes in reading order, then connectors, and on out of the canvas. Enter selects, then edits the label. Space adds to or takes out of the selection. P goes to the properties, and Shift+F10 (or the Menu key) opens a shape's menu. A **Skip to canvas** link is the first stop on the page.
- Screen reader support: shapes and connectors have names, and the app announces the selection, mode changes, undo and redo, search results, and locked shapes that can't move.
- A Help topic on keyboard and screen reader use.

### Changed
- Large diagrams are much faster: a 1,000-shape diagram first draws in a fraction of the time it took, and dragging is smoother.
- The app downloads less up front: sample diagrams and the style sheet page load only when opened.
- The keyboard focus ring on the canvas is now dashed, so it looks different from a selected shape.
- With reduce motion turned on, nothing animates: the view jumps instead of gliding.
- Slightly darker borders on fields in light mode, so they stand out on grey panels.
- Closing search, the layers sheet, the shape drawer or a menu returns focus to where you were, and Escape closes them.

## [0.18.0] - 2026-10-01

### Added
- Text styling for shapes and connectors: five fonts (Inter, Source Serif 4, JetBrains Mono, Caveat and Nunito), size, bold, italic, underline, strikethrough and, for shapes, left, centre or right alignment. Find it in the new **Text** section of the properties. Several selected items can be styled at once.
- Diagram text defaults: with nothing selected, choose the font and label size the whole diagram uses.
- Exports use the same fonts as the canvas. SVG files carry the fonts they use, so they look the same in other apps.

### Changed
- Bold or Italic is greyed out when a font doesn't have it (Caveat has no italic). Chalkline never fakes a style; the label keeps its setting for when you switch fonts back.
- Diagrams are now saved in format version 5. Older diagrams and stencils still open.

## [0.17.0] - 2026-10-01

### Added
- Find in the diagram: search shape labels and notes from the magnifying glass in the top bar, or `Ctrl F` / `Cmd F`. On a phone, it's in the menu and opens as a sheet listing the matches. Step through matches with the arrows or `Enter`; the view centres on each one. Matches on hidden layers are counted, with a button to show them, and a match inside a collapsed group offers to expand it.
- Arrow keys nudge the selection, with `Shift` for a bigger step. Nudges follow the same grid and smart guides as dragging, a held-down key is one undo step, and locked shapes stay put.
- A keyboard shortcuts page in Help, grouped by area, with the keys for Mac and for Windows and Linux. Press `?` to open it.

### Changed
- `?` now opens the keyboard shortcuts page rather than the Help home page.
- On a Mac, shortcuts use `Cmd` only, and elsewhere `Ctrl` only, so system shortcuts that use the other key are no longer intercepted.

## [0.16.0] - 2026-10-01

### Added
- 19 new shapes. A new **Networking** category: firewall, router / switch, load balancer, API gateway and CDN / edge node. In **Architecture**: cache store, message bus / pub-sub, microservice, object storage / data lake and worker / cron job. A new **AI & ML** category: AI gateway, AI guardrails, foundation model (LLM), vector database, embeddings engine, semantic cache, AI agent / orchestrator, agent identity and prompt template.
- Palette search also matches what a shape is for, so words like "pub-sub", "llm" or "rag" find the right shape.

## [0.15.0] - 2026-10-01

### Added
- A built-in "AI gateway (generic)" stencil in a new AI governance category: consumers, the gateway stages (identity, policy, guardrails, routing), model, MCP and A2A adapters, and their destinations, with notes on every part.

## [0.14.0] - 2026-09-30

### Added
- Help, a searchable guide with a quick start, a topic for each feature, and gestures and shortcuts. Open it from the ? button (on a phone, from the menu).
- What's new, showing these release notes. A dot on the help button means there are notes you haven't read yet.
- About, showing the app version, build, diagram format version, storage used and open-source credits, with a Copy details button for bug reports.
- "Learn more" links from the Link mode hint and the connector properties.
- Press ? to open help on a keyboard.

### Changed
- On desktops narrower than 1280px, the Tidy and Layers buttons show icons only, to make room for the help button.

## [0.13.0] - 2026-09-30

### Added
- The desktop properties and layers panel can collapse to a slim rail, and is remembered.

## [0.12.1] - 2026-09-30

### Fixed
- On desktop, the File, Tidy and View menus no longer open behind the properties panel.

## [0.12.0] - 2026-09-30

### Added
- The desktop shape palette can be resized by dragging its edge, and collapsed to a slim icon rail. Both are remembered.

### Changed
- The shape grid uses extra palette width, and stencil names wrap onto two lines.

## [0.11.0] - 2026-09-30

### Added
- Smart guides while dragging or resizing: line up edges and centres, match spacing and sizes.
- A View menu for snap to grid, smart guides and grid display (dots, lines or off), remembered in this browser.
- Hold Alt while dragging to pause guides.

## [0.10.0] - 2026-09-30

### Added
- Stencils: save a selection as a reusable stencil, with a personal library alongside built-in stencils.
- Templates to start a new diagram from.
- Import and export stencils as JSON files.

## [0.9.2] - 2026-09-30

### Fixed
- On a phone, swiping through the shape drawer no longer adds a shape by accident. Press and hold a shape to drag it instead.

## [0.9.1] - 2026-09-30

### Fixed
- Shapes on hidden layers are no longer drawn or clickable.

## [0.9.0] - 2026-09-30

### Added
- Layers: add, rename, reorder, hide, lock and delete layers, choose the active layer, and move items between layers.
- Export can include or leave out hidden layers.

### Fixed
- A group no longer stays selected after clicking elsewhere.
- Box-select starts from an empty selection.

## [0.8.0] - 2026-09-30

### Added
- Ten new shapes: decision, ellipse, hexagon, input/output, document, server, queue, user group, sticky note and callout.
- Change shape, to swap a shape's type and keep its label and style.
- Palette categories, search and recently used shapes.

### Changed
- Connectors attach to each shape's visible outline.
- Diagrams with a shape this version doesn't know still open, and keep that shape when saved.

## [0.7.0] - 2026-09-30

### Added
- Auto-arrange, which lays out the diagram or selection left to right or top to bottom, with compact, normal or roomy spacing.
- Tidy connectors, which spreads connectors that share a side.

## [0.6.0] - 2026-09-30

### Added
- Groups, with nesting, collapsing and a name.
- Swimlane pools with lanes you can add, move, resize and delete.
- Locking for shapes, groups and lanes.

## [0.5.0] - 2026-09-30

### Added
- Align, distribute and match size for several selected shapes.

## [0.4.0] - 2026-09-30

### Added
- Autosave in this browser, restored when you come back.
- Open and save diagrams as JSON files.
- Export to PNG, SVG and PDF.
- Undo and redo.
- Copy, cut, paste (also between tabs) and duplicate.

## [0.3.5] - 2026-09-30

### Changed
- Connectors on automatic sides route around other shapes.

## [0.3.4] - 2026-09-30

### Added
- Drag a selected connector's end grip to another docking point, or onto another shape.

## [0.3.3] - 2026-09-30

### Fixed
- Shape labels no longer overlap artwork, clip or break in the middle of a word.

## [0.3.2] - 2026-09-30

### Added
- Start and end side controls for connectors, with Reset to auto.

## [0.3.1] - 2026-09-30

### Added
- Select, Pan and Link modes. In Link mode, tap a source shape and then a target to connect them.
- Undo from the message shown after deleting.

### Changed
- Connectors attach to the nearest sides as shapes move.
- On a phone, the properties sheet keeps the selection in view.

## [0.3.0] - 2026-09-30

### Added
- A properties panel for fill, border, text colour and font size.
- Connector line shapes, arrowheads, dashes, colours, widths and labels.
- Notes on every shape and connector.
- Colour presets that follow the light and dark themes, plus custom colours.

## [0.2.0] - 2026-09-30

### Added
- The canvas: pan, zoom, minimap and fit to screen.
- A shape palette: tap or drag to add a rectangle, rounded box, database, cloud, actor or text.
- Editable labels, resizing, connectors with arrowheads, multi-select and delete.
- Snap to grid.
- Layouts for phone, tablet and desktop, with long-press menus on touch.

## [0.1.0] - 2026-09-30

### Added
- Project foundations: light and dark themes, design tokens, the diagram format and a style sheet page.
