---
title: AI features and your API key
order: 21
keywords: ai, claude, anthropic, generate, summarise, summary, usage, tokens, api key, key, byok, bring your own key, model, haiku, sonnet, test key, remove key, privacy, sent, data, blocked, network, rate limit, cost
---
Chalkline's AI features use **your own Anthropic API key**. You pay Anthropic for what you use, through your own account. Chalkline has no server: requests go straight from this browser to Anthropic's API (`api.anthropic.com`).

With a key you can [generate a diagram from a description](help:generating-diagrams) and [summarise a diagram in words](help:summarising-diagrams). Both are in the AI sheet: choose **AI** in the top bar (on a phone, the **☰** menu), then **Generate** or **Summarise**.

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

The first time, Chalkline also reminds you that what you send leaves this device. Check your own or your organisation's rules before sending anything sensitive.

Each AI action is a button you press: nothing is sent automatically, and Chalkline never retries on its own.

**Test key** sends one word ("Hi") to Anthropic's free token-counting service. It doesn't use your diagram and doesn't cost anything.

## Tokens and cost

After each AI request, the AI sheet shows the model and the input and output tokens Anthropic reported for it, with a total for this visit. The total resets when you reload and is never saved. If Anthropic doesn't report the tokens, nothing is shown. Chalkline shows tokens, not prices: your Anthropic account shows what they cost.

## Models

- **Claude Haiku 4.5**: summarising diagrams and testing your key.
- **Claude Sonnet 5.5**: generating diagrams.

## When it doesn't work

- **That API key didn't work**: copy the key again from the Claude Console, save it and test it.
- **Too many requests for now**: wait the time shown, then choose **Retry**. Chalkline never retries on its own.
- **Could not reach the API**: your network or browser may be blocking it. Ad blockers, privacy extensions and work or school networks can block `api.anthropic.com`. Try another network or browser.
- **That AI model isn't available**: reload the page to get the latest Chalkline.

See [Troubleshooting](help:troubleshooting) for more.
