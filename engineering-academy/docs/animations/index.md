---
sidebar_label: Animations
title: Animations — Index
description: Visual, step-by-step animated walkthroughs of key flows, for when a static diagram isn't enough to build intuition.
---

# Animations

Some flows are easier to internalize as a sequence of frames than as a single static diagram — this section renders those as step-through Mermaid sequences, one state transition at a time, alongside plain-language narration for each step.

## Available animations

| Animation | Shows |
|---|---|
| [Auth Flow](/animations/auth-flow) | Login through token issuance through every subsequent authenticated request |

## Why this section exists separately from Architecture

The [Architecture](/architecture/error-flow) section documents structure — what exists and why. This section documents *sequence* — the order events happen in, frame by frame, for flows that are easy to misunderstand when only shown as a single end-to-end diagram. If you've read the architecture chapters and still find yourself unsure about ordering or timing, start here instead of re-reading the structural docs.

## Related

- [Architecture → Error Flow](/architecture/error-flow)
- [API → Auth](/api/auth)
- [Security → Authorization](/security/authorization)
