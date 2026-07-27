---
sidebar_label: Quiz · Hospitality
title: "Quiz: Hospitality"
description: Self-check on hotel_restaurant floor, KOT, queue, permissions, and isolation.
---

# Quiz: Hospitality

Take after [Hospitality API](/api/hospitality) and [Product Domain](/overview/product-domain) (Hotel / Restaurant section).

## Q1

How does DG-ERP keep hotel APIs off manufacturer tenants?

<details>
<summary>Answer</summary>

`requireHospitality` in `server/routes/hospitality.ts` checks `tenants.business_type === 'hotel_restaurant'` and returns **403** otherwise. Tab presets also hide `hosp_*` tabs for other types.

</details>

## Q2

What is the difference between the permission module key `hospitality` and tab ids `hosp_floor` / `hosp_waiter` / …?

<details>
<summary>Answer</summary>

API RBAC (`PATH_MODULE`) uses **`hospitality`**. Nav uses **`hosp_*`**. `resolveTabAccess` maps `map.hospitality` onto any `hosp_*` tab so Cap Online / admin grants that only set the module still unlock Floor/Waiter/Kitchen/Queue.

</details>

## Q3

Name the kitchen status progression for an order line.

<details>
<summary>Answer</summary>

`queued` → `preparing` → `ready` → `served` via `PATCH /api/hospitality/order-items/:id/status`.

</details>

## Q4

Why is Socket.IO not used for the kitchen board in DG-ERP?

<details>
<summary>Answer</summary>

The standalone prototype used sockets; DG-ERP hospitality UIs **poll** every few seconds so they stay inside the existing Express/React stack without a second realtime transport.

</details>

## Q5

What goes wrong if you `POST .../tables/:id/clear` while an order is still `open`?

<details>
<summary>Answer</summary>

Clear only sets the table to `available` and does **not** close the order. The next open can reattach the previous open order (unique open-order-per-table index). Happy path: bill → close → clear.

</details>

## Related

- [Hospitality API](/api/hospitality)
- [Workflow 7](/architecture/business-workflows#workflow-7-hospitality-floor--kot--queue)
- [Permissions](/backend/permissions)
