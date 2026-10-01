# Review: evaluation diagrams

Six diagrams for checking **Review** by hand with a real API key. They are not run automatically: each AI review is a paid request. Draw each one in the deployed app, run **Check locally** and then **Review with AI** (normal, and once with **Deeper review**), and record what happened in the table under it.

What to check each time:

- **Local checks**: are the expected findings there, and nothing that isn't a real problem?
- **Specific, not generic**: does each AI finding name shapes from this diagram? Would it make sense for any diagram ("add monitoring" with no reason)? Generic findings are a fail.
- **Questions, not facts**: are possibly missing parts phrased as questions or considerations?
- **Padding**: does a good diagram get few findings or none? Does a tiny one get a note saying it's too small, rather than invented findings?
- **Severity**: are the high findings the ones that matter most?
- **Shape links**: does **Show shapes** select the right shapes? Did the result warn about removed shape references?
- **Cost**: the input and output tokens from the usage line, normal versus deeper.

Record results as: date, version (Help, About), model (Haiku or Sonnet for Deeper review), notes on or off, tokens in / out, and a short verdict (useful / mixed / poor).

---

## 1. Three-tier app with a single database

Shapes: an actor **Users**, a **Load balancer**, two servers **Web 1** and **Web 2**, an **App service**, and one database **Orders DB**. Connectors: Users → Load balancer → Web 1 and Web 2 → App service → Orders DB, labelled ("HTTPS", "routes", "calls", "reads and writes").

Expect: a single point of failure on **Orders DB** (and perhaps **App service**), probably high. Perhaps a question about backup for the database. No local findings.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |

## 2. RAG pipeline with no guardrail

Shapes: an actor **User**, **Chat app**, **Embedding model**, a database **Vector store**, **Retriever**, **LLM**, and a **Document loader** feeding the vector store. Connectors: User → Chat app → Retriever → Vector store; Retriever → LLM → Chat app; Document loader → Embedding model → Vector store. No guardrail, filter or evaluation step.

Expect: a question about input or output filtering (a guardrail) between the user and the LLM, phrased as a consideration. Perhaps a question about how documents are kept up to date. Nothing about specific products that aren't named.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |

## 3. Inconsistent names

Shapes: **API gateway**, **API Gateway**, **Auth service**, **Authentication Service.**, **user db**, **Orders DB**, **Organisation service** and **Organization service**, connected in a simple chain.

Expect local findings: naming inconsistency for *API gateway / API Gateway* and *Organisation / Organization service*. Not for *Auth service / Authentication Service.* (different words) or *user db / Orders DB*. The AI review may add the auth pair and the lower-case *user db* under naming.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |

## 4. Tiny two-shape diagram

Shapes: two rectangles, **Client** → **Web server**, one connector labelled "requests".

Expect: no local findings. The AI review returns no findings, or at most one, with a note that the diagram is too small to review usefully. Any list of generic advice is a fail.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |

## 5. Well-formed diagram

A clear, consistent diagram with one level of detail: actor **Shopper** → **Web shop** → **Order service** → queue **Order events** → **Fulfilment service**; **Order service** → database **Orders DB (primary)** with a dashed connector to **Orders DB (replica)**; **Monitoring** connected to both services; **Identity provider** connected to **Web shop** labelled "sign in". Every connector labelled.

Expect: few findings (zero to two), all low or medium, none generic. No local findings, even with **Include connectors without labels** on.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |

## 6. A disconnected shape

Diagram 1, plus a database **Audit log** with no connectors, and a sticky note "Check retention" with no connectors.

Expect local finding: **Audit log** has no connections. The sticky note is not flagged. The AI review may ask what writes to the audit log.

| Date | Version | Model | Notes | Tokens in / out | Verdict | What happened |
| ---- | ------- | ----- | ----- | --------------- | ------- | ------------- |
|      |         |       |       |                 |         |               |
