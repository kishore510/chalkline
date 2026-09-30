# Changelog

All notable changes to Chalkline are listed here, newest first. The format follows Keep a Changelog, and versions follow the project convention: 0.x, a minor bump for each merged slice and a patch bump for each follow-up fix.

## [0.13.0] - 2026-09-30

### Added
- Help, a searchable guide with a quick start, a topic for each feature, and gestures and shortcuts. Open it from the ? button (on a phone, from the menu).
- What's new, showing these release notes. A dot on the help button means there are notes you haven't read yet.
- About, showing the app version, build, diagram format version, storage used and open-source credits, with a Copy details button for bug reports.
- "Learn more" links from the Link mode hint and the connector properties.
- Press ? to open help on a keyboard.

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
