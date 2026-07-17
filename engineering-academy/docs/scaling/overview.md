---
sidebar_label: Overview
title: Overview
description: Dhandho Engineering Academy — scaling/overview
---

# Overview

:::tip Curriculum chapter
Part of the **Dhandho Engineering Academy** (`scaling/overview`). Built for ownership transfer of DG-ERP — not a wiki stub.
:::

## Learning objectives

- Explain why this area exists in the product narrative  
- Point to the concrete files that implement it  
- Name one failure mode and one mitigation  
- Complete the exercise before marking yourself done  

## Scaling & redesign

Scale problems worth solving **after** metrics prove pain:

1. DB CPU from unindexed filters  
2. Event-loop blocking parses  
3. Multi-instance sticky authCache assumptions  
4. Schema migrations needing true versioning  

## Redesign options (when earned)

| Move | Trigger |
| --- | --- |
| Extract reporting read replica | Report queries starve OLTP |
| Job queue for IRN/EWB | NIC latency blocks UX |
| React Query | Cache bugs across views |
| Real migration tool | Destructive schema changes frequent |

See tech debt register for scored items from prior audits (82→88).


## Cross-links

- [Welcome](/)  
- [System overview](/architecture/system-overview)  
- [Multi-tenancy](/architecture/multi-tenancy)  
- [Threat model](/security/threat-model)  
- [Labs](/labs)  
- [Runbooks](/runbooks)  
- [Glossary](/glossary)  
- [Generated file index](/files/generated)  

## Further reading

- Product repo `DEVELOPER.md`, `docs/architecture.md`  
- Academy continuity: `CONTINUITY.md` at academy root  
