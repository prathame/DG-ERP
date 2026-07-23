---
sidebar_label: WhatsApp Business API
title: WhatsApp Business Cloud API (optional)
description: Optional Meta Cloud API for cloud tenants — SA company detail, three send modes, personal WhatsApp fallback.
---

# WhatsApp Business Cloud API (optional)

Cloud tenants can turn on Meta WhatsApp **Cloud API** in Super Admin → **Cloud** → company detail. Everyone else keeps today’s personal WhatsApp share (`wa.me` / Cap / Electron).

## Modes (when Business is ON)

| Mode | Behavior |
|------|----------|
| `company` | Company phone number ID + token; **all** users send via API |
| `company_selected` | Same company creds; only users with `whatsapp_api_allowed` use API |
| `per_user` | Each user has their own phone number ID + token; missing → personal share |

Business **OFF** → no API path; existing share helpers unchanged.

## Configure in Super Admin

1. Open **Cloud** → tenant detail (not create modal).
2. **Tab Customization → Options → WhatsApp Business API** — toggle ON.
3. Pick send mode (1 / 2 / 3).
4. Modes 1–2: enter company **Phone number ID** + **Access token** (optional display phone / WABA ID).
5. Mode 2: in **Cloud seats** panel, tick **Use company WhatsApp** per user.
6. Mode 3: in **Cloud seats** panel, enter per-user phone number ID + token.
7. Save tab options / Save WhatsApp on the seat row.

Tokens are encrypted at rest (`encryptSecret`) and never returned raw — SA GET shows `••••••••` / `whatsappAccessTokenConfigured`.

## Send API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/whatsapp/send` | Tenant JWT |

Body: `{ "to": "<phone>", "message": "<text>" }` (aliases: `phone`, `text`).

- Resolves credentials by tenant mode + user flags (server-side).
- Calls Meta Graph `/{phone-number-id}/messages` (text; links in body).
- Ineligible / Meta failure → non-2xx with `code: WHATSAPP_API_UNAVAILABLE` or `WHATSAPP_API_FAILED` so the client falls back to personal share.

Client session (login / profile) exposes only:

- `whatsappBusinessEnabled`
- `whatsappSendMode`
- `whatsappApiAllowed`
- `whatsappDisplayPhone` (optional)

No tokens in the browser.

## Schema

**tenants:** `whatsapp_business_enabled`, `whatsapp_send_mode`, `whatsapp_phone_number_id`, `whatsapp_access_token`, optional `whatsapp_waba_id`, `whatsapp_display_phone`

**users:** `whatsapp_api_allowed`, `whatsapp_phone_number_id`, `whatsapp_access_token` (mode 3)

Keep user preference `auto_whatsapp` as-is.

## Out of scope (v1)

Inbound webhooks, template approval UI, PDF media via Graph, on-prem / offline WABA, new SA nav item.

## Related

- Creds helper: `server/utils/whatsappBusiness.ts`
- Route: `server/routes/whatsapp.ts`
- Client gate: `src/lib/whatsappSend.ts`
