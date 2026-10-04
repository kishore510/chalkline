---
title: Refining a diagram with AI
order: 26
keywords: refine, extend, add, fix, improve, rename, relabel, reshape, redirect, remove, ai refine, add shapes, add cache, monitoring, guardrail, selection, context, preview, apply, change log, why, reasons, rationale, narrative, claude, sonnet, cost, resize, collapse, panel, effort, deeper refine, try again, incomplete, garbled, raw answer
---
**Refine** asks Claude to improve the part of your diagram you select. It **adds** what's missing and **fixes** what looks wrong, and it **explains every change**. For example: "add a cache between these two", "add monitoring for the selected services" or "tidy this up and fix anything that looks off". You see a preview with Claude's reasons first, and nothing changes until you choose **Apply**. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## What Refine can do

Refine can **add**:

- new shapes, and new connectors to and from the shapes already there;
- a missing connector between two shapes that are already there (never a second one where they're already connected).

Refine can **fix** the selected shapes and their connectors:

- **rename** a shape, or relabel (or clear the label on) a connector;
- **change a shape's type**, for example a database drawn as a plain box;
- **turn an arrow round**, make it point both ways, or take its arrowheads off;
- **remove** a selected shape (its connectors go with it) or one of its connectors. For example, when you ask for a cache between A and B, Claude adds the cache, connects it to A and B, and can remove the old connector from A to B so the flow goes through the cache.

Refine never moves, resizes or restyles anything, and never changes groups or layers. The shapes connected to your selection are context only: Claude can connect to them but can't change them. **Locked** shapes and connectors, and anything on a hidden layer, are never changed: a fix to them is skipped and the change log says so.

## Refine part of a diagram

1. Select one or more shapes. They're what the instruction is about, and the only shapes Refine can change.
2. Choose **AI** in the top bar, then **Refine**. On a phone, choose **Refine with AI…** in the **☰** menu. With nothing selected, the sheet asks you to select shapes first.
3. Type what to add or improve (up to 1,000 characters), or start from an example: **Cache**, **Monitoring** or **Guardrail**. The examples only fill in the text.
4. Choose **Generate**. A check step shows the model, the shapes that will be sent and the estimated size. Choose **Send**. **Cancel** stops the request while you wait.

The request uses the shapes selected when you pressed **Generate**. Changing the selection while you wait doesn't change it.

## Effort and Deeper refine

Refine thinks harder when the request calls for it. Chalkline picks the effort from your request, without asking Claude, and shows it under **Deeper refine** before you send:

- **High effort** when your instruction asks for a redesign (words such as redesign, modernise, rework, best practice, resilient, production, scalable, secure, harden, migrate, outdated or too simple), when it's long (over 200 characters), or when the selection brings a lot of context (more than 5 selected shapes, or more than 12 selected and connected).
- **Medium effort** for everything else: adding a cache, a missing piece, monitoring, or extending the diagram.

Turn **Deeper refine** on or off to override it. The check step shows the effort and why. High effort takes longer and uses more tokens, and the size estimate on the check step allows for that.

## The preview and the reasons

The preview starts with **what's actually in the answer**, counted by Chalkline, for example "In this answer: 1 new shape, 2 new connectors, no changes to your shapes." Under it, labelled **Claude says**, is Claude's own summary of what it did and why. If the two don't match, believe the count. Below them:

- a drawing of the result: the new shapes where they'll land, and the shapes the fixes touch as they'll look. Shapes shown only for context are **faded**;
- **Fixes to what's there**: each fix in plain words, with Claude's reason under it ("Why: …"). Each has a tick box, on by default. **Untick any fix you don't want**;
- **Additions**: each new shape (and any connector worth calling out), with its reason;
- a list of anything Claude asked for that was fixed up or left out, for example an unknown shape becomes a rounded box, or a change to a shape you didn't select is left out.

Then:

- **Apply** makes the ticked fixes and adds the new items in **one undo step**, selects what changed and centres the view on it. **Undo** puts everything back.
- **Regenerate** asks again, through the check step, for the same shapes.
- **Edit instruction** goes back to your text.
- **Cancel** closes the sheet. Nothing changes.

If Claude finds nothing to add or fix (or the instruction isn't clear), the sheet says **Nothing to change**, with Claude's summary.

### When an answer looks incomplete

Chalkline checks that the answer hangs together. It says **This answer looks incomplete** when:

- none of the new shapes is connected to anything, or
- Claude's summary describes renaming, reshaping, rerouting or removing things, but the answer has no fixes.

Then **Try again** comes first and **Apply** becomes **Apply anyway** (for when you'd rather wire things up yourself). If only some new shapes are unconnected, the list of things left out says so.

### When an answer comes back garbled

Sometimes Claude loses its place partway through an answer and writes parts of the answer inside other text, so pieces go missing. Chalkline spots this and says **Claude's answer came back garbled**, quoting the broken text. Nothing can be applied, and nothing has changed. Choose **Try again**.

**Try again** goes through the check step as usual (it says "Second try") and tells Claude what went wrong with its last answer.

**Show Claude's raw answer**, under the preview, shows exactly what came back. It's for checking what went wrong, and it's kept only while the sheet is open.

## The AI change log

After **Apply**, the **AI change log** opens. (It records [Generate and Suggest notes](help:ai-features) too.) It tells the story of each refinement, newest first: when it happened, what you asked, what was actually applied, Claude's own summary (as **Claude says**), and each change with its reason. Fixes that were skipped (because the item was deleted, locked or hidden since) are listed too, with why.

- Choose a line to select and show those items on the canvas.
- **Undo this change** on the newest entry undoes it, while nothing else has changed since.
- Close it with **×**. To open it again, choose **AI**, then **Show the AI change log** under the mode buttons.

Where it goes, and how to make room:

- **Desktop**: a panel docked beside the canvas, between the canvas and the properties panel, so it never covers the canvas, minimap or controls.
- **Tablet**: it slides over the right edge of the canvas.
- On both, **drag its left edge** to make it wider or narrower (or focus the edge and use the arrow keys; `Home` and `End` jump to the narrowest and widest). Double-click the edge for the default width. Drag it well past the narrowest width to collapse it. The chevron button collapses it to a slim rail; the rail's chevron expands it again.
- **Phone**: a sheet at the bottom of the screen. The chevron shrinks it to a slim bar above the toolbar, so you can keep drawing; the bar's chevron opens it again.
- Long labels wrap inside the panel; it never scrolls sideways.

The width and whether it's collapsed are remembered in this browser, like the palette's. The log itself lasts until you reload the page. It isn't saved with the diagram or in any export.

## Where new shapes go

Only the new shapes are laid out, left to right. They go beside the selection, to the right if there's room or else below, on the grid if it's on, without covering anything visible. Existing shapes never move. In a busy diagram, new connectors can be long and cross others. Tidy them up afterwards if you like.

New shapes and connectors go on the **active layer**, as pasting does. If that layer is hidden or locked, **Apply** says so and offers **Switch layer**. Fixes don't need the active layer.

New connectors can end on **locked shapes**, just as you can connect to them by hand: the locked shape isn't changed. Shapes on hidden layers aren't sent, so nothing connects to them. If a shape a new connector needs was deleted or hidden after you sent the request, that connector is left out and the message says so.

## What is sent

Only after you press **Send**:

- the selected shapes: their labels and shape types;
- the shapes connected to them, as **read-only context**: labels and shape types, with each connector's label and direction (at most 8 connections per shape). Shapes on hidden layers are left out, and the check step counts them;
- existing notes on the selected shapes **only if** you turn on **Include notes** (off by default);
- your instruction, and Chalkline's instructions: the shapes and colours it can use, the refine rules and the answer format.

Shapes and connectors are sent under stand-in names (e1, n1, c1…). **Real ids and positions are never sent**, nor are colours, styling or images. Your labels and notes are sent as data, never as instructions.

## Limits

- At most **30 shapes of context** (selected plus connected). If a selection brings more, the check step says so and asks you to select fewer. Nothing is cut short without you knowing.
- At most **15 new shapes**, **30 new connectors** and **20 fixes** per answer.
- Groups aren't added or changed by Refine yet.

## Cost and usage

Each **Generate** (and each **Regenerate** or **Try again**) is one request to Claude Sonnet 5.5, paid from your Anthropic account. Sonnet costs more per token than Haiku. The reasons make answers a little longer, and high effort uses more tokens again. A garbled or incomplete answer is still billed by Anthropic. After it, the sheet shows the tokens Anthropic reported, plus a total for this visit. The preview and your instruction aren't saved, aren't an undo step and aren't in any export.

> **AI suggestions can be wrong, and so can its reasons.** Read the fixes before applying, untick any you don't agree with, and Undo if the result isn't what you wanted.
