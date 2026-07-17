---
sidebar_label: Quiz · Database
title: "Quiz: Database & Tenancy"
description: Self-check on schema, RLS, fragments, and migrations.
---

# Quiz: Database & Tenancy

## Q1

What is the **primary** tenant isolation mechanism?

<details>
<summary>Answer</summary>

Explicit `WHERE tenant_id = $1` in application SQL. RLS is a safety net; pool owner bypasses RLS.

</details>

## Q2

Name three real SQL fragment exports from `helpers.ts`.

<details>
<summary>Answer</summary>

Any of: `DISTRIBUTION_BILL_UNIT_SQL`, `DISTRIBUTION_TAXABLE_SQL`, `DISTRIBUTION_TAX_SQL`, `PURCHASE_TAXABLE_SQL`, `PURCHASE_TAX_SQL`, plus TS helpers `splitGst`, `gstFromExclusive`.

</details>

## Q3

Why isn't schema managed with Flyway/Knex today?

<details>
<summary>Answer</summary>

Idempotent `initSchema()` on boot simplifies on-prem self-heal and solo ops. Trade-off: weak downgrade story; use expand/contract for destructive changes.

</details>

## Q4

Why chunk bulk inserts around 5000 rows?

<details>
<summary>Answer</summary>

Postgres bind-parameter limit (~65535). Large batches must be split.

</details>

## Q5

What does composite PK `(id, tenant_id)` buy you?

<details>
<summary>Answer</summary>

Makes tenancy part of row identity; pairs with tenant-scoped FKs and safer import/export mental model.

</details>

## Related

- [RLS](/database/rls)  
- [Tenant Tables](/database/tenant-tables)  
- [Migrations](/database/migrations-strategy)  
