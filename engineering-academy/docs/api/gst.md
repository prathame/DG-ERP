---
sidebar_label: GST API
title: GST / NIC API Endpoints
description: Settings, IRN generate/cancel, E-Way Bill generate — admin-only NIC integration.
---

# GST / NIC API Endpoints

**Router:** `server/routes/gst-api.ts`  
**Service:** `server/services/nic-api.ts`  
**Module:** `accounts` (see `PATH_MODULE`)  
**Role:** Admin for mutations

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/gst/settings` | Mode, GSTIN, username, redacted secrets |
| PUT | `/api/gst/settings` | Update; encrypt password/clientSecret |
| POST | `/api/gst/irn/generate` | Lock batch → NIC → store IRN/QR |
| POST | `/api/gst/ewb/generate` | Needs vehicleNo + distance |
| POST | `/api/gst/irn/cancel` | Cancel IRN with NIC + local update |

Related **report** endpoints (not NIC): `/api/reports/gstr1`, `/api/gstr3b/compute`, `/api/gstr2b/reconcile` on accounts/reports routers.

## Security properties

- Secrets at rest: AES-256-GCM  
- Secrets never returned in full on GET  
- `safeError` allow-list on NIC failures  
- Admin gate + module permissions  

## Modes

`mock` | `sandbox` | `production` — see [NIC Service](/backend/services-nic-api).

## Failure & support

Always collect: tenant slug, batch id, correlationId, gst_api_mode, approx time.  
Runbook: [GST API Failures](/runbooks/gst-api-failures).

## Common mistakes

1. Testing production mode against sandbox keys  
2. Regenerating IRN after already acknowledged without cancel flow  
3. Putting NIC keys in `VITE_*`  

## Interview question

*What is the difference between GSTR-1 export and IRN generation?*

:::info Answer sketch
GSTR-1 is a **report/export** of books for filing workflows. IRN is a **live registration** of a specific invoice with NIC that returns a legal IRN/QR. Different routers, different failure modes.
:::

## Related

- [NIC Service](/backend/services-nic-api)  
- [Sales & Distribution API](/api/sales-distribution)  
- [Secrets](/security/secrets)  
