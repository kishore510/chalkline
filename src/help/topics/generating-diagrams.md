---
title: Generating diagrams with AI
order: 22
keywords: ai, generate, text to diagram, describe, prompt, claude, sonnet, preview, warnings, add to canvas, regenerate, cost, tokens, limits, mcp
---
Describe a diagram in plain words and Chalkline asks Claude to draw it. You see a preview first, and nothing is added until you choose **Add to canvas**. It uses your own Anthropic API key: see [AI features and your API key](help:ai-features).

## Generate a diagram

1. Choose **AI** in the top bar. On a phone, open the **☰** menu and choose **Generate with AI…**
2. Describe the diagram, or start from one of the examples.
3. Choose **Generate**. A check step shows the model, what will be sent and its estimated size. Choose **Send**.
4. Wait for the preview. **Cancel** stops the request.
5. Look over the preview, then choose **Add to canvas**.

The new shapes go in empty space beside your diagram (or in the middle of the view if the canvas is empty), on the layer you're adding to, and stay selected. **Undo** removes them all in one step.

## Writing a good description

- Name the parts and how they connect: "a mobile app calls an API gateway, which routes to an orders service and a payments service".
- Say what kind of thing each part is: "a Redis cache", "a Kafka event bus", "a vector database", "an MCP server". Chalkline then picks the matching shape.
- Mention boundaries you want drawn as boxes: "inside a private network", "the agent host".
- Keep it to one diagram. Smaller descriptions give clearer results.

## What is sent

Only your description, plus Chalkline's instructions: the list of shapes and colours it can use, and the format the answer must follow. The instructions are the same every time. **Nothing from your current diagram is sent**: no shapes, labels, notes or file name. Turn on **Include short notes** to ask for a one-sentence note on shapes where it helps.

The answer never contains positions. Chalkline checks it and lays it out itself, with the same layout as **Auto-arrange**.

## The preview and what was changed

The preview shows the generated shapes and connectors, with a count. **List the shapes and connectors** shows their labels as text. If anything in the answer had to be fixed, **What was changed** says what, for example:

- a shape Chalkline doesn't have is drawn as a rounded box,
- a colour it doesn't have is left out,
- a connector to a shape that isn't there is left out,
- anything over the limits is shortened or left out.

From the preview you can **Add to canvas**, **Regenerate** (a new request, so it goes through the check step again), **Edit description** or **Cancel**.

## Only ever adds

Generating never changes, moves or deletes anything already in your diagram. If the layer you're adding to is hidden or locked, Chalkline says so and offers **Switch layer**; the preview is kept.

## Limits

- Descriptions up to 2,000 characters.
- Up to 40 shapes, 80 connectors and 8 groups.
- Labels up to 80 characters, notes up to 200.
- Swimlanes aren't generated. Groups are plain boxes.

## Cost

Each **Generate** or **Regenerate** is one request to Claude Sonnet 5.5, paid from your Anthropic account. The check step shows the estimated size of what's sent (mostly the instructions). The answer adds to the cost too: a bigger diagram, or notes, costs more. Asking again within a few minutes reuses the instructions from Anthropic's prompt cache, which costs less.

## When it doesn't work

- **The answer couldn't be turned into a diagram**: choose **Retry**, or reword your description.
- **The answer was cut off**: ask for fewer shapes, or turn off notes.
- **The AI declined this request**: reword the description.

Chalkline never retries on its own. See [Troubleshooting](help:troubleshooting) for key and network problems.
