---
sidebar_label: Labs
title: Labs — Index
description: Hands-on exercises that require actually running the code, not just reading about it. Start here.
---

# Labs

:::warning Deferred track
Labs are **paused for now**. Use [Quizzes](/quizzes) and [Day-1 Onboarding](/tutorials/day-1-onboarding) instead. Hands-on labs will be deepened later.
:::

Reading this Academy tells you how Dhandho works. Labs are where you break it, on purpose, in a safe local environment, to build the instinct that only comes from having felt a bug happen under your own hands.

## Prerequisites for every lab

```bash
git clone <repo>
cd DG-ERP
npm ci
cp .env.example .env   # fill in DATABASE_URL (local Postgres 16) and JWT_SECRET
npm run server &       # backend on :3001
npm run dev            # frontend on :3000, proxies /api to :3001
```

You'll need a local Postgres 16 instance — `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16` is the fastest path if you don't already have one. `npm run server` runs `initSchema()` automatically on boot — no separate setup step.

## Available labs

| Lab | What you'll build/break | Difficulty |
|---|---|---|
| [Add an Endpoint](/labs/lab-add-endpoint) | A brand-new route from scratch, wired through auth, permissions, and RLS | Beginner |
| [GST Math](/labs/lab-gst-math) | Reproduce and fix a rounding discrepancy in `splitGst()` | Intermediate |
| [Offline Queue](/labs/lab-offline-queue) | Simulate a mobile network drop and trace the offline mutation queue end-to-end | Intermediate |
| [Tenant Isolation](/labs/lab-tenant-isolation) | Deliberately introduce a cross-tenant leak, then find it via a test | Advanced |
| [Debug 403](/labs/lab-debug-403) | Diagnose a real-shaped permission bug from symptom to root cause | Advanced |

## How labs are graded (self-graded — this is for you, not a submission)

Each lab ends with a "Done when" checklist. If you can't check every box, that's the signal to re-read the linked chapter, not to move on — the whole point of a lab is closing a specific gap in your mental model, and skipping ahead defeats that.

## Suggested order for a new backend engineer

1. [Add an Endpoint](/labs/lab-add-endpoint) — builds the full-stack mental model of "how does a request become a database row."
2. [Tenant Isolation](/labs/lab-tenant-isolation) — internalizes the single most important security invariant in the codebase.
3. [Debug 403](/labs/lab-debug-403) — practices the authorization debugging skill you'll actually use in real support tickets.
4. [GST Math](/labs/lab-gst-math) — domain-specific, but touches the highest-blast-radius shared function in the backend.

## Related

- [Learning Paths](/learning)
- [Backend → Patterns](/backend/patterns)
- [Security → Tenant Isolation](/security/tenant-isolation)
- [Testing → How to Add Tests](/testing/how-to-add-tests)
