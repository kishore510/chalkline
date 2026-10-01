---
title: Reviewing diagrams
order: 24
keywords: review, check, checks, lint, findings, local checks, ai review, deeper review, single point of failure, missing, naming, duplicate, unconnected, labels, data flow, abstraction, show shapes, dismiss, markdown, copy, download, claude, haiku, sonnet, cost
---
**Review** gives you a short list of things worth a second look in your diagram. It's read-only: **nothing in your diagram is changed**. There are two kinds of check, shown separately:

- **Local checks** run in this browser. They're instant, free, and **nothing is sent** anywhere. You don't need an API key.
- **AI review** sends your diagram to Claude and asks for specific findings. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## Review a diagram

1. Choose **AI** in the top bar, then **Review**. On a phone, open the **☰** menu and choose **Review with AI…**
2. Choose **Check locally** for the local checks only, or set the options under **AI review** and choose **Review with AI**.
3. For an AI review, a check step shows the model, the scope, the focus areas, how many shapes, connectors and notes are included, and the estimated size. Choose **Send**. **Cancel** stops the request while you wait.

An AI review runs the local checks too, on the same version of the diagram.

## Local checks

Shapes on hidden layers are left out.

- **Shapes with no connections**. Text, sticky notes and callouts aren't counted, and a diagram with only one shape isn't flagged.
- **Duplicate labels**: different shapes with exactly the same label.
- **Naming inconsistency**: the same name written differently, such as *API gateway* and *API Gateway*, *Log-in* and *Login*, a trailing full stop, or *-ise* and *-ize*. Plurals and different words are left alone.
- **Empty or starting labels**: a shape with no label, or still with the label it was added with (such as "Database"). Empty text boxes aren't counted.
- **Connectors without labels**: off unless you turn on **Include connectors without labels**. Many good diagrams leave obvious links unlabelled.

## AI review

- **What to review**: the whole diagram, or the selected shapes (and the connectors between them).
- **Look for**: single points of failure, missing components (such as monitoring, authentication, caching, backup or error handling, only where the diagram suggests they matter), unclear or inconsistent naming, data flow and direction, and mixed levels of abstraction. All are on to start with. Turn off the ones you don't want.
- **Include notes** and **Include hidden layers** work as they do for summaries: both are off unless you turn them on.
- **Deeper review** uses Claude Sonnet 5.5 instead of Claude Haiku 4.5. It **costs more**: each token costs more, and it thinks before it answers, so it uses more tokens. It also takes longer. The check step shows which model is used.

Claude is told to review only what's shown, not to assume technologies or requirements that aren't in the diagram, to ask about possibly missing parts rather than state they're missing, to avoid generic advice, and to return fewer findings rather than pad the list. If a diagram is too small or too vague to review, it should say so instead. Your labels and notes are sent as data, never as instructions.

Each finding names the shapes it's about. If Claude names a shape that wasn't sent, that reference is removed and the result says how many were removed. At most 10 AI findings are shown, the most serious first.

> **AI review can be wrong or miss things.** Treat it as a prompt for thought, not an audit.

## What is sent

Only for **AI review**, and only after you press **Send**: your diagram's title, labels, shape types, which way connectors point and their labels, and which group each shape is in, plus Chalkline's review instructions. The same rules as summaries apply: notes and hidden layers only if you turn them on, and never colours, styling, positions or images. **Local checks send nothing.**

## The findings

Findings are grouped: **Checked locally, nothing sent** first, then **AI review** from high to low. Each has a severity (**High**, **Medium** or **Low**, shown as a word and an icon), a title, an explanation and a suggestion.

- **Show shapes** selects the shapes a finding is about and centres the view on them. It closes the sheet so you can see them. Choose **AI** again to come back to the review. If some of them are on hidden layers, you can show those layers or select only the visible ones. A shape inside a collapsed group is shown by selecting the group.
- **Dismiss** hides a finding until you reload or run that check again. **Show dismissed findings** brings them back.
- **Copy all (Markdown)** and **Download as .md** give you the findings you haven't dismissed, as a Markdown file named like `web-architecture-review.md`.
- **Review again with AI** is a new request, so it goes through the check step again.

Review results are never saved with your diagram, aren't an undo step and aren't in any export. If you change the diagram after a review, the results say **the diagram has changed since this review**. You can still read them, but some may be out of date.

## Cost and usage

Each AI review is one request, paid from your Anthropic account. After it, the sheet shows the model and the tokens Anthropic reported, plus a total for this visit. Local checks are free.

## When it doesn't work

- **The review couldn't be read**: the answer wasn't a list of findings Chalkline could read. Choose **Retry**. Chalkline never retries on its own.
- **Too much to send in one go**: review the selection instead, or leave out notes or hidden layers.

See [Troubleshooting](help:troubleshooting) for key and network problems.
