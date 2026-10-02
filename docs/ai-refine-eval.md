# Refine with AI: evaluation cases

Eight cases for checking **Refine** by hand with a real API key. They are not run automatically, because each request is paid. Draw each case in the deployed app, select the shapes named, choose **AI**, **Refine**, type the instruction, then **Generate** and **Send**. Record what happened in the table under the case.

What to check each time:

- **Add-only**: after **Add to canvas**, is every existing shape, connector and group exactly as before? Nothing is moved, renamed, restyled or deleted, and old connectors are still there.
- **Relevant**: does it add what the instruction asks for, and no more? Are there no duplicates of shapes that already exist?
- **Connected**: do new connectors go to the right existing shapes, in the right direction?
- **Naming**: are the labels short and in the same style as the existing ones?
- **Placement**: are the new shapes beside the selection (right, else below), on the grid, covering nothing? Note any long or crossing connectors.
- **Preview**: are the anchor shapes faded? Is the warnings list empty or sensible? Is "Existing connectors are not changed." shown?
- **Undo**: does one **Undo** remove everything that was added, and nothing else?
- **Cost**: the input and output tokens from the usage line.

Record results as: date, version (Help, About), notes on or off, tokens in / out, and a short verdict (useful / mixed / poor).

---

## 1. A cache between two services

Shapes: **Web app** (rounded) → **Orders service** (microservice) → **Orders DB** (database). Select **Orders service** and **Orders DB**.

Instruction: "Add a cache between these two."

Expect: one cache shape, connected from **Orders service** and to **Orders DB** (or the read path shown some other sensible way). The old connector from **Orders service** to **Orders DB** stays.

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

Expect: an AI guardrails shape, connected from **Chat app** and to **LLM**. The old connector stays. The guardrail is probably red, as the colour hints suggest.

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

## 5. An instruction that can't be done by adding

Shapes: **Frontend** → **Backend**. Select both.

Instruction: "Rename these to Client and Server, and delete the connector."

Expect: **Nothing to add**, with a short reason, and no **Add to canvas** button. If anything is suggested, it must not rename or delete. Check the warnings list.

| Date | Version | Notes on | Tokens in / out | Verdict | What happened |
| ---- | ------- | -------- | --------------- | ------- | ------------- |
|      |         |          |                 |         |               |

## 6. An ambiguous instruction

Shapes: **Service A** → **Service B**. Select both.

Instruction: "Make it better."

Expect: **Nothing to add**, with a reason asking for something more specific, or a very small, clearly explained addition. Note which one.

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
