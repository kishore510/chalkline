---
title: Keyboard and screen readers
order: 19
keywords: keyboard, screen reader, accessibility, a11y, tab, focus, voiceover, nvda, jaws, talkback, reduced motion, skip, without a mouse, resize panel, collapse panel
---
You can make and edit diagrams with the keyboard alone. Every button, menu and field is reachable with `Tab`, and the full list of keys is on the [keyboard shortcuts page](help:gestures-and-shortcuts) (press `?`).

## Getting to the canvas

The first `Tab` on the page shows **Skip to canvas**, which jumps straight past the top bar and the shape palette. The canvas itself is one stop in the page's `Tab` order.

## Moving around the canvas

- `Tab` and `Shift Tab` move between shapes and group frames in reading order (top to bottom, then left to right), then on to the connectors. Past the last one (or before the first), focus leaves the canvas as normal.
- Shapes on hidden layers and inside collapsed groups are skipped.
- The focused shape has a dashed ring. Selected shapes have a solid outline and resize handles, so you can tell the two apart.

## Selecting and editing

- `Enter` selects the focused shape. `Enter` again edits its label (`Enter` saves, `Escape` cancels). On a connector, the second `Enter` goes to its label field.
- `Space` adds the focused shape to the selection, or takes it out.
- `P` goes to the selection's properties: style, text, size, notes and more.
- `Shift F10` (or the Menu key) opens the same menu as right-click or long-press.
- Arrow keys move the selection; hold `Shift` for a bigger step.
- `Escape` clears the selection.
- To add a shape, press `Enter` on it in the palette: it's placed in the middle of the view.
- To connect two shapes, switch to Link mode (`L`), then press `Enter` on the source shape and then on the target.

## Screen readers

Shapes are read as their label and type, for example "Orders, database". Connectors say which shapes they join. The app also tells you, without moving focus:

- what's selected
- when the mode changes
- undo and redo
- the search result count and current match
- when a locked shape can't move

## Still easier with a pointer

- **Moving a shape into an existing group**: drop it on the group. With the keyboard, select the shapes and choose **Group** to make a new group instead.
- **Reattaching a connector end to a different shape**: drag its end grip. With the keyboard, choose the start and end sides in its properties, or delete it and link the shapes again.
- **Resizing a group or container**: drag its edge. Shapes have width and height fields, and lanes have a size field.
- **Panning freely**: use **Fit to screen** (`F`), zoom (`+` and `-`), or move focus with `Tab`; the view follows the focused shape.

## Resizing panels

The edge of the palette (desktop) and of the AI change log (tablet and desktop) is a separator you can reach with `Tab`. The arrow keys make the panel wider or narrower, `Home` and `End` jump to its narrowest and widest. Each panel also has a collapse button, so nothing needs dragging.

## Reduced motion

If your device is set to reduce motion, Chalkline doesn't animate: the view jumps instead of gliding when it fits, centres or zooms, and panels and sheets appear without sliding.
