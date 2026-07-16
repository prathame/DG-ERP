# Platforms

Client code is split by **where it runs** and **how it talks to the server**.

```
platforms/
├── shared/          # Used by every client (API URL helpers, etc.)
├── mobile/          # Capacitor Android / iOS
│   ├── online/      # Native shell, Super Admin onboarding, heartbeat
│   └── offline/     # Queue, cache, connectivity banner
└── desktop/         # Electron
    ├── online/      # Cloud wrapper (thin browser around hosted ERP)
    └── offline/     # On-prem UI helpers (local DB + optional cloud sync)
```

| Path | Runtime | Mode | Notes |
|------|---------|------|--------|
| `mobile/online` | Capacitor | Online | Invite/slug onboarding, status bar, splash, fetch → cloud, heartbeat |
| `mobile/offline` | Capacitor / PWA | Offline-first | Mutation queue, GET cache, `OfflineBanner` |
| `desktop/online` | Electron `electron/cloud` | Online | Loads hosted web app; no local DB |
| `desktop/offline` | Electron `electron/onprem` | Offline | Embedded Postgres; `OnlineStatus` for license sync |
| `shared` | All | — | `apiBase` (origin / native fetch patch) |

Native Electron processes live under repo-root `electron/` (see `electron/README.md`):

- `electron/cloud` → **desktop · online**
- `electron/onprem` → **desktop · offline**

Feature screens stay in `src/features/` — they are shared across platforms.

## Docs

| Doc | Audience |
|-----|----------|
| [`docs/MOBILE.md`](../../docs/MOBILE.md) | Mobile product, APIs, Super Admin sync, build |
| [`mobile/README.md`](mobile/README.md) | Capacitor onboarding + offline notes |
| [`desktop/README.md`](desktop/README.md) | Electron online/offline map |
| [`DEVELOPER.md`](../../DEVELOPER.md) | Full engineering reference |
