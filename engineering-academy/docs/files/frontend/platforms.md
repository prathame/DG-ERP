---
sidebar_label: platforms/*
title: File map — src/platforms/*
description: Pointer to the Platforms knowledge page.
---

# `src/platforms/*`

See [Frontend → Platforms](/frontend/platforms).

| Path | Role |
|------|------|
| `shared/` | API base URL resolution |
| `desktop/online/` | Electron cloud marker |
| `desktop/offline/` | On-prem online-status UI |
| `service-cloud/` | Online seats claim + session gate |
| `service-mobile/` | Offline Capacitor + PGlite |

Cloud phone **layout** (safe areas, modals) is not under `platforms/` — see [Cloud Mobile UX](/frontend/cloud-mobile) and `src/index.css` / `App.tsx`.
