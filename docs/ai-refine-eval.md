# Refine with AI: evaluation cases

Eleven cases for checking **Refine** by hand with a real API key. They are not run automatically, because each request is paid. Draw each case in the deployed app, select the shapes named, choose **AI**, **Refine**, type the instruction, then **Generate** and **Send**. Record what happened in the table under the case.

What to check each time:

- **Scope of fixes**: after **Apply**, did only the **selected** shapes and their connectors change? Neighbours, locked items, groups and layers are untouched, and nothing is moved, resized or restyled.
- **Fixes are justified**: is every fix a clear improvement, and does its "Why" actually explain it? Note any fix that renames for taste or removes something for no good reason.
- **Narrative**: does "Claude says" tell, in a sentence or two, what changed and why? Does it match the "In this answer" count above it?
- **Effort**: is the effort shown on the check step (medium or high, and why) the one you'd expect for the request?
- **Answer health**: any "looks incomplete" or "came back garbled" message? If so, note it, open **Show Claude's raw answer**, and record what went wrong. Then **Try again** and note whether the second try fixed it.
- **Tick boxes**: untick one fix before **Apply**; is it left alone, and missing from the change log?
- **Relevant**: does it add what the instruction asks for, and no more? Are there no duplicates of shapes or connectors that already exist?
- **Connected**: do new connectors go to the right existing shapes, in the right direction?
- **Naming**: are the labels short and in the same style as the existing ones?
- **Placement**: are the new shapes beside the selection (right, else below), on the grid, covering nothing? Note any long or crossing connectors.
- **Preview**: are context shapes faded and fixed shapes shown as they'll look? Is the warnings list empty or sensible?
- **AI change log**: does it open after **Apply** with the summary and each change's reason? Does choosing a line select those items? On desktop it is docked (not over the canvas); its edge resizes it and the chevron collapses it.
- **Undo**: does one **Undo** (or **Undo this refinement** in the log) put everything back, and nothing else?
- **Cost**: the input and output tokens from the usage line.

Record results as: date, version (Help, About), notes on or off, tokens in / out, and a short verdict (useful / mixed / poor).

---

## 1. A cache between two services

Shapes: **Web app** (rounded) → **Orders service** (microservice) → **Orders DB** (database). Select **Orders service** and **Orders DB**.

Instruction: "Add a cache between these two."

Expect: one cache shape, connected from **Orders service** and to **Orders DB** (or the read path shown some other sensible way). The old direct connector is probably removed, with a reason such as "requests now go through the cache". If it's kept, the summary should say why.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 2. Monitoring for several selected services

Shapes: **API gateway** → **Users service**, **Payments service** and **Search service** (all microservices). Select the three services.

Instruction: "Add monitoring for the selected services."

Expect: one monitoring shape (or a small monitoring stack, at most two or three shapes), with a connector from each of the three services, probably dashed. Nothing joins two existing services.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 3. A guardrail before a model

Shapes: actor **User** → **Chat app** (rounded) → **LLM** (LLM shape). Select **Chat app** and **LLM**.

Instruction: "Add a guardrail before the model."

Expect: an AI guardrails shape, connected from **Chat app** and to **LLM**, and the old direct connector removed so traffic goes through the guardrail. The guardrail is probably red, as the colour hints suggest.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 4. A second instance for resilience

Shapes: **Load balancer** → **App server** → **Database**. Select **App server**.

Instruction: "Add a second instance of this for resilience."

Expect: one new app server, labelled to match (for example "App server 2"), connected from **Load balancer** and to **Database**. Neither existing shape is changed.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 5. Renames and a removal

Shapes: **Frontend** → **Backend**. Select both.

Instruction: "Rename these to Client and Server, and delete the connector."

Expect: three fixes (two renames, one connector removal), each with a reason, and no new shapes. Untick the removal before **Apply**: the shapes are renamed and the connector stays. The change log lists the two renames only.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 6. An ambiguous instruction

Shapes: **Service A** → **Service B**. Select both.

Instruction: "Make it better."

Expect: **Nothing to change**, with a summary asking for something more specific, or a few small, clearly explained fixes. Note which one, and whether each reason holds up.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 7. A single selected shape

Shapes: one **Orders API** (rectangle), with no connectors. Select it.

Instruction: "Add a database and a queue it uses."

Expect: a database and a queue, both connected to **Orders API**, placed to its right. The check step shows 1 selected shape and 0 connected shapes.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 8. A selection over the cap

Shapes: load the example diagram, or draw at least 31 connected shapes, then select them all (or enough that selected plus connected shapes come to more than 30).

Instruction: "Add logging everywhere."

Expect: nothing is sent. With more than 30 selected, the sheet asks you to select fewer before **Generate** is enabled. With fewer selected but more than 30 shapes of context, the check step says so and **Send** is disabled.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 9. Fixing mistakes it wasn't asked about

Shapes: **Orders API** (rectangle) → **Orders** (rectangle, meant to be the database), with the arrow drawn from **Orders** to **Orders API**, and a second, duplicate connector from **Orders API** to **Orders**. Select both.

Instruction: "Add a cache in front of the database and fix anything that looks wrong."

Expect: a cache; **Orders** changed to a database shape; the duplicate connector removed or the arrow turned round, each with a reason. The summary tells the story in a sentence or two. Nothing outside the selection changes.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 10. Locked and neighbouring shapes stay as they are

Shapes: **Gateway** → **Svc** → **DB**. Lock **Svc**. Select **Svc** only.

Instruction: "Give everything clearer names."

Expect: Claude may suggest renaming **Svc**, but it's locked: the change log lists it as skipped ("it's locked or on a hidden layer"). **Gateway** and **DB** are neighbours, so they are never renamed; any such suggestion shows in the warnings list as left out.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 11. "Too simple and outdated": a redesign of a plain flow

Shapes: **Tickets UI** → **Tickets API** → **Tickets db**, all plain rectangles. Select all three.

Instruction: "This flow of ui to api to db feels too simple and outdated. can you refine it to reflect modern architecture using aws cloud elements and resilient architecture and industry best practices"

This is the request that, in 0.29.0, returned four unconnected shapes, no fixes and a summary describing far more.

Expect: **high effort**, "because your instruction asks for a redesign". A connected flow such as UI → CDN → WAF → API gateway → load balancer → API → cache or database, with the old direct connectors removed, and **Tickets UI**, **Tickets API** and **Tickets db** reshaped to their proper types. No "looks incomplete" message, and the "In this answer" count matches "Claude says". If it does come back incomplete or garbled, **Try again** should fix it.

| Date | Version | Notes on | Effort | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | ------ | --------------- | ------- | ------------- |
|      |         |          |        |                 |         |               |
