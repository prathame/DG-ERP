---
sidebar_label: Product Surfaces
title: Product Surfaces (Web + Electron)
description: How the same React features render inside the web SPA, Electron cloud app, and Electron on-prem app.
---

# Product Surfaces

Dhandho ships through **three** shells that load the same `src/features/*` React components:

| Surface | Shell | Data |
|---|---|---|
| **Web** | Browser SPA (`vite` → `dist/`) | Cloud Postgres |
| **Electron Cloud** | Desktop wrapper around hosted app | Cloud Postgres |
| **Electron On-Prem** | Desktop + embedded Postgres | Local DB; optional cloud license heartbeat |

There is **no Capacitor / phone app** in this codebase. Phone users use the responsive web app in a browser.

See [Platforms](/frontend/platforms) and [On-Prem API](/api/mobile-onprem).
