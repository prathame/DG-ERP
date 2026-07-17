---
sidebar_label: Product Surfaces
title: Product Surfaces (Web + Electron + Service Mobile)
description: How the same React features render inside the web SPA, Electron apps, and Service Mobile offline phone.
---

# Product Surfaces

Dhandho ships through shells that load the same `src/features/*` React components:

| Surface | Shell | Data |
|---|---|---|
| **Web** | Browser SPA (`vite` → `dist/`) | Cloud Postgres |
| **Electron Cloud** | Desktop wrapper around hosted app | Cloud Postgres |
| **Electron On-Prem** | Desktop + embedded Postgres | Local DB; optional cloud license heartbeat |
| **Service Mobile** | Capacitor iOS/Android (`dist-service-mobile`) | On-device PGlite; SA `DG-SM-` license + hard sync/backup |

Service Mobile is **service business type only**, separate from desktop on-prem licenses. It is not the removed cloud Capacitor invite-queue product.

See [Platforms](/frontend/platforms) and [On-Prem API](/api/mobile-onprem).
