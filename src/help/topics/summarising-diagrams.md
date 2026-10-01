---
title: Summarising diagrams with AI
order: 23
keywords: ai, summarise, summarize, summary, describe, documentation, document, component list, markdown, copy, download, claude, haiku, tokens, usage, cost, limits, hidden layers, selection, notes
---
Ask Claude to describe your diagram in words: a short summary, a list of components, or a structured document. It's read-only: **nothing in your diagram is changed**. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## Summarise a diagram

1. Choose **AI** in the top bar, then **Summarise**. On a phone, open the **☰** menu and choose **Summarise with AI…**
2. Choose a style, and what to summarise: the whole diagram or the selected shapes.
3. Choose **Summarise**. A check step shows the model, the scope, how many shapes, connectors and notes are included, and the estimated size. Choose **Send**.
4. Read the result. **Cancel** stops the request while you wait.

## Styles

- **Short summary**: one paragraph and a few bullets on what the diagram is for and its main flow.
- **Component list**: each component, its role and what it connects to.
- **Documentation**: a structured document with an overview, the components, the data flow, and notes and assumptions.

## What is sent

Your diagram's title, labels, shape types (such as "Database"), which way connectors point and their labels, and which group each shape is in. Only the scope you chose is sent: with **Selected shapes only**, that's the selected shapes (and everything inside a selected group) and the connectors between them.

- **Notes** are left out unless you turn on **Include notes**.
- **Hidden layers** are left out. The sheet says how many items that is, and **Include hidden layers** adds them.
- Shapes inside **collapsed groups** are included, the same as when the group is open.
- Colours, styling, positions and images are never sent.

What's sent is fixed when the check step opens. Changing the selection while you wait doesn't change it.

Claude is told to describe only what's in the diagram, to say when something is unclear, and not to assume technologies that aren't shown. Your labels and notes are sent as data: text in them that looks like an instruction (such as "ignore previous instructions") is treated as a label, not followed.

## The result

The result is shown as formatted text. Links in it are shown as plain text, never as clickable links, and images and web content are never loaded.

- **Copy (Markdown)** copies the text with its Markdown formatting.
- **Download as .md** saves it as a Markdown file named after your diagram, such as `web-architecture-summary.md`.
- **Regenerate** asks again. It's a new request, so it goes through the check step again.
- **Close** closes the sheet.

The summary is never saved with your diagram, isn't an undo step and isn't in any export. It's gone when you close the sheet, so copy or download it first if you want to keep it.

> The summary is **AI-generated and may contain mistakes**. Check it against your diagram before you share it.

## Limits

- A summary can send up to about **40,000 tokens** (roughly 120,000 characters). A bigger diagram isn't cut short: the check step says it's too big and offers to summarise the selection instead. Turning off notes or hidden layers also makes it smaller.
- Very long answers can be cut off. If that happens, the result says so: try a shorter style or fewer shapes.

## Cost and usage

Each **Summarise** or **Regenerate** is one request to Claude Haiku 4.5, paid from your Anthropic account. After each AI request (summaries and generated diagrams), the sheet shows the model and the input and output tokens Anthropic reported, plus a total for this visit. The total resets when you reload and is never saved. Chalkline shows tokens only, not prices: see your Anthropic account for what they cost.

## When it doesn't work

- **The AI declined this request**: try summarising different shapes.
- **Too much to send in one go**: select fewer shapes, or leave out notes.

Chalkline never retries on its own. See [Troubleshooting](help:troubleshooting) for key and network problems.
