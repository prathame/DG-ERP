---
sidebar_label: On-Prem License
title: Runbook — On-Prem License Issues
description: Diagnosing activation failures, machine-binding conflicts, and heartbeat/license-expiry problems for on-prem installs.
---

# Runbook — On-Prem License Issues

## Symptoms

- A customer can't activate their on-prem install with their license key.
- An on-prem customer's app shows a "suspended" or "license expired" blocking modal.
- Super Admin's on-prem fleet view shows a `last_seen` that's stale (install may be dark).
- Customer wants to move their install to a new machine.

## The four relevant endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/onprem/activate` | None (license key is the credential) | First-time activation, binds license to a `machineId` |
| `POST /api/onprem/heartbeat` | None | Periodic (~15 min) liveness + version/usage check |
| `POST /api/onprem/deactivate` | None, but requires matching `licenseKey` + `machineId` | Unbinds a license from its current machine, for transfer |
| Super Admin license management | `superAdminMiddleware` (JWT) | Issue/revoke/inspect licenses |

All four public on-prem endpoints share `onpremLimiter` — 60 requests per 15 minutes — a deliberately generous limit given legitimate traffic is just one activation attempt plus one heartbeat every ~15 minutes per install; hitting this limit almost certainly indicates a retry loop bug on the client side, not real usage.

## "Activation fails with 'Invalid license key'"

```sql
SELECT license_key, status, valid_until, machine_id FROM onprem_licenses WHERE license_key = $1;
```

- **No row at all** → the key was never issued, or was mistyped. License key format is `DG-XXXXXXXX-XXXXXXXX-XXXXXXXX` (three 8-hex-char segments, `generateLicenseKey()` in `server/routes/onprem.ts` — 96 bits of entropy total). Check for transcription errors (0 vs O, 1 vs l) — a common real-world support issue with manually-typed keys.
- **Row exists, `status != 'active'`** → e.g. `revoked`/`suspended` — the activation attempt correctly returns `403 { error: 'License ${status}' }`. Check why it was set to that status before reactivating.
- **`valid_until` is in the past** → `403 { error: 'License expired' }` — a legitimate expiry, not a bug. Resolution is a renewal (extend `valid_until`), typically a Super Admin/sales action.

## "Activation fails with 'License already activated on another machine'"

```ts
if (lic.machine_id && lic.machine_id !== machineId) {
  return res.status(403).json({ error: 'License already activated on another machine. Contact support to transfer.' });
}
```

**This is machine-binding working as intended**, not a bug — one license key is deliberately tied to one machine at a time (`getMachineId()` in `electron/onprem/license-store.ts` hashes MAC addresses, so it's stable across reboots but changes if the customer replaces hardware or does certain OS reinstalls).

**Legitimate reasons this happens:**
1. Customer is trying to activate on a *second* machine without deactivating the first (e.g. testing on a spare laptop, or migrating hardware).
2. Customer reinstalled their OS or replaced network hardware, changing their effective `machineId` even though it's "the same" machine to them.

**Resolution path:**
1. Confirm with the customer which machine should hold the license going forward.
2. If they still have access to the *original* machine: have them run deactivation from that machine (`POST /api/onprem/deactivate` with matching `licenseKey`+`machineId`) — this sets `machine_id = NULL`, freeing the license for the new machine's activation.
3. If they've lost access to the original machine (hardware died, etc.): a Super Admin can manually clear `machine_id` for that license via direct DB access or an admin tool — this is a support override, not a self-service path today. Verify identity/ownership through your normal support channel before doing this; a `machine_id` reset effectively transfers a paid license, which is exactly the kind of action worth a second look.

## "Customer sees a suspended/blocking modal in the app"

This comes from a heartbeat response with `licenseValid: false`:

```ts
const isValid = lic.status === 'active' && (!lic.valid_until || new Date(lic.valid_until) >= new Date());
const isMachineMatch = !lic.machine_id || lic.machine_id === machineId;
res.json({ licenseValid: isValid && isMachineMatch, ... });
```

Two independent conditions must both hold for `licenseValid: true`: **status/expiry** AND **machine match**. If a customer's install suddenly shows suspended without anyone changing their license status, check whether their `machineId` somehow changed (see prior section) — this presents identically to a genuine suspension from the app's perspective, but has a completely different fix.

## "Fleet view shows a stale `last_seen`"

Heartbeats fire roughly every 15 minutes (`HEARTBEAT_INTERVAL_MS` in `electron/shared/constants.ts`) **only while the app is running and has network connectivity**. A stale `last_seen` means one of:

1. The customer closed the app (expected — no heartbeat while not running).
2. The customer's machine lost internet (the app itself still works fully offline; only the heartbeat, which is non-blocking, fails silently).
3. The app crashed and isn't running (worth proactively reaching out if `last_seen` is stale for an unusually long time for an otherwise-active customer).

There is no urgency to a single stale heartbeat — this is expected, normal behavior for how often a small business actually has their PC running. Only treat a **sudden change from a previously-consistent pattern** (e.g. daily heartbeats for months, then silence) as worth a proactive check-in.

## Version-gating an on-prem fleet

`platform_config` table stores `min_onprem_version`/`latest_onprem_version`; every heartbeat response includes `updateAvailable`/`forceUpdate` computed against the reporting install's `version`. Use this the same way you'd use mobile version gating (see [Deploy Rollback](./deploy-rollback.md)) to steer a fleet away from a known-bad release without needing every customer to proactively check for updates themselves.

## Related pages

- [Electron deployment](/deployment/electron)
- [Deploy Rollback](./deploy-rollback.md)
- [SRE Overview](/sre/overview)
- [Glossary → Engineering Terms](/glossary/engineering-terms)
