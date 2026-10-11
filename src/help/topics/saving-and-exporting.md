---
title: Saving, opening and exporting
order: 13
keywords: save, open, export, json, png, svg, pdf, image, download, backup, file, mermaid, mmd, markdown, flowchart, diagram as code, copy
---
Everything here is in the menu (the three lines at the top right).

## Save and open

- **Save as JSON** (`Ctrl S`) downloads the diagram as a file. It's the backup format and the way to move a diagram to another browser or device.
- **Open JSON** loads a saved file. You can undo back to what you had.
- Files saved by older versions of Chalkline still open.

## Export

- **PNG**: a picture, good for chat and documents.
- **SVG**: sharp at any size, good for web pages and further editing.
- **PDF**: good for printing and sharing.

Exports use the current theme's colours and include only visible layers, unless you turn on **Include hidden layers**.

Exports use the same fonts as the canvas. An SVG carries the fonts its labels use inside the file, so it looks the same in other apps. PNG and PDF are drawn from that SVG. The PDF holds a high-resolution picture of the diagram, so its text can't be selected or searched.

## Mermaid

**Mermaid (.mmd)** turns the diagram into a Mermaid flowchart: text you can paste into Markdown, wikis and docs that draw Mermaid. It opens a sheet where you can:

- choose the **Direction**: **Auto** (left to right for a wide diagram, otherwise top-down), **Top-down** or **Left-right**
- turn on **Include notes** to add notes as comment lines (Mermaid doesn't draw them)
- check the **Preview** and the **What is not included** list
- **Download .mmd** or **Copy to clipboard**. If copying is blocked, the text is selected so you can copy it yourself.

What carries over: shape labels, connectors and their labels, groups and swimlanes (as nested subgraphs), fill and border colours (light theme values), and arrows, dashed and thick lines.

What Mermaid export loses:

- Positions and sizes. Mermaid lays the diagram out itself.
- Shapes Mermaid doesn't have (for example actor, cloud and text) become rectangles. The list says which.
- Fonts and text styling, text colour, border widths, connector colours, line types and routing, and pinned connector sides.
- Filled arrowheads (they become plain ones), and lines that are both thick and dashed (they become dashed).
- Layers: hidden layers are always left out, whatever **Include hidden layers** says, and the rest is exported on one level.
- Locks.
- Notes, unless you turn on **Include notes**.
- A collapsed group is exported as one shape, as on screen; connectors to the shapes inside it go to the group.

> Exported images can't be opened again for editing, and neither can Mermaid text. Save as JSON too.
