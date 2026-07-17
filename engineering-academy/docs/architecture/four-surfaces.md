---
sidebar_label: Product Surfaces
title: Product Surfaces (Web + Electron + Service Cloud + Service Mobile)
description: How the same React features render inside the web SPA, Electron apps, Service Cloud seats, and Service Mobile offline phone.
---

# Product Surfaces

Dhandho ships through shells that load the same `src/features/*` React components:

| Surface | Shell | Data |
|---|---|---|
| **Web** | Browser SPA (`vite` → `dist/`) | Cloud Postgres |
| **Electron Cloud** | Desktop wrapper around hosted app | Cloud Postgres |
| **Electron On-Prem** | Desktop + embedded Postgres | Local DB; optional cloud license heartbeat |
| **Service Cloud seats** | Electron Cloud and/or online Capacitor (`capacitor.cloud.config.ts`) | Same cloud tenant; device slots + company-wide session lock |
| **Service Mobile** | Capacitor iOS/Android (`dist-service-mobile`) | On-device PGlite; SA `DG-SM-` license + hard sync/backup |

Service Mobile is **service business type only**, separate from desktop on-prem licenses and from **Service Cloud seats** (online). Do not mix installers or license keys.

Phone usability for the cloud SPA (not offline SM) is documented in [Cloud Mobile UX](/frontend/cloud-mobile).

See [Platforms](/frontend/platforms), [Service Cloud API](/api/service-cloud), [On-Prem API](/api/mobile-onprem).
