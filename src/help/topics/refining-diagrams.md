---
title: Refining a diagram with AI
order: 26
keywords: refine, extend, add, ai refine, add shapes, add cache, monitoring, guardrail, add-only, selection, context, preview, add to canvas, claude, sonnet, cost
---
**Refine** asks Claude to add to the part of your diagram you select. For example: "add a cache between these two", "add monitoring for the selected services" or "add a guardrail before the model". You see a preview first, and nothing is added until you choose **Add to canvas**. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## Add-only

Refine can **only add** new shapes and new connectors. New connectors can go to and from the shapes already there. It never changes, moves, restyles, relabels, locks, groups, ungroups or deletes anything that already exists. If Claude's answer tries to, that part is left out and the preview says so.

**Existing connectors are not changed.** If you ask for a cache between A and B, Claude adds the cache and connects it to A and B, and the old connector from A to B stays. Delete it yourself if you no longer want it.

## Refine part of a diagram

1. Select one or more shapes. They're what the instruction is about.
2. Choose **AI** in the top bar, then **Refine**. On a phone, choose **Refine with AI…** in the **☰** menu. With nothing selected, the sheet asks you to select shapes first.
3. Type what to add (up to 1,000 characters), or start from an example: **Cache**, **Monitoring** or **Guardrail**. The examples only fill in the text.
4. Choose **Generate**. A check step shows the model, the shapes that will be sent and the estimated size. Choose **Send**. **Cancel** stops the request while you wait.

The request uses the shapes selected when you pressed **Generate**. Changing the selection while you wait doesn't change it.

## The preview

The preview shows the new shapes and connectors as they'll look, next to the shapes they connect to, which are **faded** because they won't change. It also shows how many shapes and connectors will be added, and a list of anything that was fixed or left out. For example: an unknown shape becomes a rounded box, an unknown colour is dropped, a connector that joined two existing shapes is left out, and long labels are shortened.

- **Add to canvas** adds everything in **one undo step**, selects the new items and centres the view on them. **Undo** removes everything that was added, and nothing else.
- **Regenerate** asks again, through the check step, for the same shapes.
- **Edit instruction** goes back to your text.
- **Cancel** closes the sheet. Nothing is added.

If Claude finds nothing that can be done by adding (the instruction asks to rename or delete something, or isn't clear), the sheet says **Nothing to add**, with Claude's reason if it gave one.

## Where new shapes go

Only the new shapes are laid out, left to right. They go beside the selection, to the right if there's room or else below, on the grid if it's on, without covering anything visible. Existing shapes never move. In a busy diagram, new connectors can be long and cross others. Tidy them up afterwards if you like.

New shapes and connectors go on the **active layer**, as pasting does. If that layer is hidden or locked, **Add to canvas** says so and offers **Switch layer**.

New connectors can end on **locked shapes**, just as you can connect to them by hand: the locked shape isn't changed. Shapes on hidden layers aren't sent, so nothing connects to them. If a shape a new connector needs was deleted or hidden after you sent the request, that connector is left out and the message says so.

## What is sent

Only after you press **Send**:

- the selected shapes: their labels and shape types;
- the shapes connected to them, as **read-only context**: labels and shape types, with each connector's label and direction (at most 8 connections per shape). Shapes on hidden layers are left out, and the check step counts them;
- existing notes on the selected shapes **only if** you turn on **Include notes** (off by default);
- your instruction, and Chalkline's instructions: the shapes and colours it can use and the add-only rules.

Shapes are sent under stand-in names (e1, n1…). **Real ids and positions are never sent**, nor are colours, styling or images. Your labels and notes are sent as data, never as instructions.

## Limits

- At most **30 shapes of context** (selected plus connected). If a selection brings more, the check step says so and asks you to select fewer. Nothing is cut short without you knowing.
- At most **15 new shapes** and **30 new connectors** per answer.
- Groups aren't added by Refine yet.

## Cost and usage

Each **Generate** (and each **Regenerate**) is one request to Claude Sonnet 5.5, paid from your Anthropic account. Sonnet costs more per token than Haiku. After it, the sheet shows the tokens Anthropic reported, plus a total for this visit. The preview and your instruction aren't saved, aren't an undo step and aren't in any export.

> **AI suggestions can be wrong.** Check the preview before adding, and Undo if it isn't what you wanted.
