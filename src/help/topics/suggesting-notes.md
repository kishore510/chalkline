---
title: Suggesting notes
order: 25
keywords: suggest notes, notes, annotate, annotation, ai notes, describe shape, accept, accept all, append, dismiss, show shape, changed since, claude, haiku, cost
---
**Suggest notes** asks Claude for a short note on each of the shapes you select: what the component does in this diagram, or one thing worth considering about it. You check every suggestion before anything is written, and accepting one **only ever adds to that shape's notes**. Nothing else in your diagram is touched. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## Suggest notes

1. Select **1 to 5 shapes**. With more than 5 selected, Chalkline asks you to select fewer instead of leaving some out.
2. Choose **AI** in the top bar, then **Notes**. You can also choose **Suggest a note with AI…** in a shape's properties, or, on a phone, **Suggest notes with AI…** in the **☰** menu.
3. Choose **Suggest notes**. A check step shows the model, the shapes, what is included and the estimated size. Choose **Send**. **Cancel** stops the request while you wait.

## Check each suggestion

Each shape gets a card with its label and type, its current note (if it has one), the suggested note in a box you can edit, how many characters it has (up to 300), and sometimes a short line on why.

- **Accept** writes the note to the shape. What's in the box is what's saved, so edit it first if you like.
- A shape that **already has a note** offers **Append to existing note** instead: the new text goes after a blank line. A suggestion never replaces a note.
- **Accept all** accepts every card you haven't dismissed, in one go.
- **Dismiss** hides a card. **Show dismissed suggestions** brings it back.
- **Show shape** selects the shape and centres the view on it. Choose **AI** again to come back to the cards.

Each **Accept** or **Accept all** is **one undo step**: **Undo** puts the previous notes back exactly. Accepted notes are ordinary notes: they show the note badge, they're found by **Find in diagram**, and they're saved and exported like any note. Suggestions you haven't accepted are never saved, aren't an undo step and aren't in any export.

If you change a shape's label or note after sending, its card says **changed since this suggestion**, and you need to tick **I've checked: accept it anyway** first. A shape you delete drops off the list. A shape on a hidden layer can't be accepted until you show its layer.

**Locked shapes** work as they do when you type a note: a lock stops moving, resizing and deleting, but notes stay editable. So suggestions can be accepted on locked shapes, in locked groups and on locked layers.

> **AI suggestions can be wrong.** Check each one before accepting.

Claude is told to use only each shape's label, type and connections; not to invent technologies, products, numbers or requirements that aren't shown; to say when it's unsure; and to skip a shape whose role isn't clear rather than guess. The result lists any shapes it skipped.

## What is sent

Only after you press **Send**:

- for each selected shape: its label, its shape type and what that type is for;
- the shapes connected to it, as context only: their labels and types, with each connector's label and direction. At most 8 connections per shape; the check step says if any were left out. Shapes on hidden layers are left out;
- existing notes **only if** you turn on **Use existing notes as context**. Otherwise Claude is only told that a shape has a note, not what it says.

Shapes are sent under stand-in names (e1, e2…), never their ids. Positions, colours, styling and images are never sent. Your labels and notes are sent as data, never as instructions.

## Cost and usage

Each **Suggest notes** is one request to Claude Haiku 4.5, paid from your Anthropic account. After it, the sheet shows the tokens Anthropic reported, plus a total for this visit.

## When it doesn't work

- **The suggestions couldn't be read**: the answer wasn't a list of notes Chalkline could read. Choose **Retry**. Chalkline never retries on its own.
- If something was fixed in the answer (an extra suggestion for the same shape, formatting removed, a note shortened), the result says so.

See [Troubleshooting](help:troubleshooting) for key and network problems.
