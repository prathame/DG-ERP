---
sidebar_label: Product Surfaces
title: Product Surfaces (Web + Electron + Service Cloud + Service Mobile)
description: How the same React features render inside the web SPA, Electron desktop, Service Cloud seats, and Service Mobile offline phone.
---

# Product Surfaces

Dhandho ships through shells that load the same `src/features/*` React components:

| Surface | Shell | Data |
|---|---|---|
| **Web** | Browser SPA (`vite` → `dist/`) | Cloud Postgres |
| **Desktop Electron** | Unified installer (`dist-electron/desktop`) | Online → cloud Postgres; Offline → local embedded Postgres |
| **Service Cloud seats** | Desktop Online and/or Cap phone with **Online** mode | Same cloud tenant; device slots + company-wide session lock |
| **Service Mobile (Offline)** | Cap phone with **Offline** mode (`dist-service-phone`) | On-device PGlite; SA `DG-SM-` license + hard sync/backup |

**Unified Cap shell:** one Android + one iOS download. First launch picks Online or Offline **once** (separate auth/data — no switching, no shared login).

**Unified Desktop shell:** one Mac + Windows installer. First launch picks Online or Offline **once** (main-process latch in `userData/desktop-mode.json`). Offline uses on-prem licenses; Online uses cloud seats. Legacy separate Cloud (~20MB) and On-Prem installers are retired.

Offline phone is **service business type only**, separate from desktop on-prem licenses and from Online cloud seats. Do not mix license keys with cloud passwords.

Phone usability for the cloud SPA (not offline SM) is documented in [Cloud Mobile UX](/frontend/cloud-mobile).

See [Platforms](/frontend/platforms), [Service Cloud API](/api/service-cloud), [On-Prem API](/api/mobile-onprem), [Electron](/deployment/electron).
