---
title: AI features and your API key
order: 21
keywords: ai, claude, anthropic, generate, summarise, refine, extend, fix, change log, summary, review, findings, suggest notes, notes, deeper review, local checks, usage, tokens, api key, key, byok, bring your own key, model, haiku, sonnet, test key, remove key, privacy, sent, data, blocked, network, rate limit, cost
---
Chalkline's AI features use **your own Anthropic API key**. You pay Anthropic for what you use, through your own account. Chalkline has no server: requests go straight from this browser to Anthropic's API (`api.anthropic.com`).

With a key you can [generate a diagram from a description](help:generating-diagrams), [summarise a diagram in words](help:summarising-diagrams), [review a diagram](help:reviewing-diagrams) for things worth a second look, [suggest notes](help:suggesting-notes) for selected shapes, and [refine](help:refining-diagrams) the selected part of a diagram: add to it, fix it, and read why each change was made. All five are in the AI sheet: choose **AI** in the top bar (on a phone, the **☰** menu), then **Generate**, **Summarise**, **Review**, **Notes** or **Refine**.

**Review** also has **local checks** (unconnected shapes, duplicate or inconsistent names, empty labels). They run in this browser, need no key, and send nothing.

## Add your key

1. Create a key in the Claude Console, under **API keys**.
2. Open **Settings**, then **AI**, paste the key and choose **Save key**.
3. Choose **Test key** to check it works.

Once saved, the key is never shown again. You only see its last four characters, for example `•••• 7Q2c`. To change it, choose **Replace key**.

## Where the key is kept

Under **Keep the key**:

- **This session only** (the default): the key stays in this page's memory and is never written to browser storage. It's forgotten when you reload or close the tab.
- **Remember on this device**: the key is stored in this browser's storage, so it's still there next time. It's stored unencrypted, and other pages on the same web address could read it. Only choose this on a device that's yours alone.

Switching moves the key and removes it from the other place.

## Remove the key

Choose **Remove key** in Settings, AI. **Clear local data** (Settings, Data) removes it too, whichever way it was kept.

## What stays out of your files

The key is never put in a backup (**Export everything**), a diagram file, a stencil export, a link or an error message. Error details hide anything that looks like a key.

It is only ever sent to Anthropic, in the request's key header. It's never part of what the model reads (the prompt), never in a generated preview or diagram, and never written to the browser's console.

## What is sent

Nothing is sent until you press **Send**. Before every AI request, Chalkline shows:

- the model it uses, by name,
- what's included (for diagrams: how many shapes, connectors and notes),
- the estimated size, in characters and approximate tokens.

**Generate diagram** sends only your description and Chalkline's instructions (the shapes and colours it can use). Nothing from your current diagram goes with it.

**Summarise** sends your diagram, or just the selected shapes: ids, labels, shape types, connections and their direction, and groups. Notes are left out unless you turn on **Include notes**, and hidden layers unless you turn on **Include hidden layers**. Colours, styling, positions and images are never sent. Your labels and notes are sent as data, never as instructions to the model.

**Review** sends the same as **Summarise** (with the same notes and hidden-layer switches), plus the focus areas you chose. Its local checks send nothing.

**Suggest notes** sends only the 1 to 5 selected shapes (labels, shape types and what each type is for) and the shapes they connect to, as context, with connector labels and directions (at most 8 connections per shape, none on hidden layers). Shapes go under stand-in names (e1, e2…), never their ids, and never with positions. Existing notes go only if you turn on **Use existing notes as context**.

**Refine** sends the selected shapes (labels and shape types) and the shapes they connect to as read-only context (labels, shape types, connector labels and directions; at most 30 shapes in all, none on hidden layers), plus your instruction. Like Suggest notes, it uses stand-in names (e1, n1, c1…): real ids and positions are never sent. Existing notes go only if you turn on **Include notes**.

The first time, Chalkline also reminds you that what you send leaves this device. Check your own or your organisation's rules before sending anything sensitive.

Each AI action is a button you press: nothing is sent automatically, and Chalkline never retries on its own.

**Test key** sends one word ("Hi") to Anthropic's free token-counting service. It doesn't use your diagram and doesn't cost anything.

## Tokens and cost

After each AI request, the AI sheet shows the model and the input and output tokens Anthropic reported for it, with a total for this visit. The total resets when you reload and is never saved. If Anthropic doesn't report the tokens, nothing is shown. Chalkline shows tokens, not prices: your Anthropic account shows what they cost.

## Models

- **Claude Haiku 4.5**: summarising and reviewing diagrams, suggesting notes, and testing your key.
- **Claude Sonnet 5.5**: generating diagrams, refining diagrams, and **Deeper review**. Sonnet costs more per token than Haiku, and a deeper review thinks before answering, so it uses more tokens: the check step always names the model.

## How far to trust it

AI answers can be wrong. Summaries can misdescribe a diagram, and a review can be wrong or miss things: treat it as a prompt for thought, not an audit. Suggested notes can be wrong too, so check each one before accepting. Results are never saved with your diagram or put in an export.

Only two AI actions write to your diagram, and only when you choose to:

- **Suggest notes**, when you accept a card. It only ever adds to a shape's notes field, never replaces a note, and never changes anything else. Each **Accept** or **Accept all** is one undo step.
- **Refine**, when you choose **Apply**. It adds new shapes and connectors and can fix the **selected** shapes and their connectors (rename, change shape type, turn an arrow round, remove), each with a reason you read first. You can untick any fix. It never moves or restyles anything, and never changes locked items or the shapes around your selection. Applying is one undo step, and the AI change log keeps the story.

## When it doesn't work

- **That API key didn't work**: copy the key again from the Claude Console, save it and test it.
- **Too many requests for now**: wait the time shown, then choose **Retry**. Chalkline never retries on its own.
- **Could not reach the API**: your network or browser may be blocking it. Ad blockers, privacy extensions and work or school networks can block `api.anthropic.com`. Try another network or browser.
- **That AI model isn't available**: reload the page to get the latest Chalkline.

See [Troubleshooting](help:troubleshooting) for more.
