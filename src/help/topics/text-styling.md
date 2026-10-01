---
title: Text styling
order: 18
keywords: text, font, typeface, bold, italic, underline, strikethrough, align, alignment, size, serif, monospace, handwritten, caveat, nunito, default font
---
Select a shape or connector and open the **Text** section of its properties.

- **Font**: Inter (the default), Source Serif 4, JetBrains Mono, Caveat (handwritten) or Nunito (rounded). Each one is shown in its own font. **Default** follows the diagram's font.
- **Size**: the label's text size. **Default** follows the diagram.
- **Bold**, **Italic**, **Underline** and **Strikethrough**. Underline and strikethrough take turns: turning one on turns the other off.
- **Alignment** (shapes only): left, centre or right. Connector labels are one line, so they have no alignment.

Styling applies to the whole label. Select several shapes or connectors to style them all at once; a control shows **Mixed** (or a dashed outline) where they differ, and a change applies to all of them as one step you can undo.

## Fonts without bold or italic

Bold or Italic is greyed out, with **Not available in this font**, when a font doesn't have that style. Chalkline never fakes one. Caveat has no italic, for example. If you switch an italic label to Caveat, it draws upright, but it's still saved as italic, so switching to a font with italic brings it back.

Caveat is a handwriting font: it gets hard to read below about 14 px.

## Diagram defaults

With nothing selected, **Text defaults** sets the font and shape label size for the whole diagram. Shapes, connectors and group titles use them unless they have their own. Connector labels keep their own smaller size.

Shapes grow to fit their label when the font or size makes it bigger. They never cut text off.

Exports use the same fonts. See [Saving, opening and exporting](help:saving-and-exporting).
