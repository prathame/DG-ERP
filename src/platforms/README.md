# Platforms

Client code is split by **where it runs** and **how it talks to the server**.

```
platforms/
├── shared/          # API URL helpers (all clients)
└── desktop/         # Electron helpers
    ├── online/      # Cloud wrapper marker
    └── offline/     # On-prem OnlineStatus UI
```

| Path | Runtime | Mode | Notes |
|------|---------|------|--------|
| `desktop/online` | Electron `electron/cloud` | Online | Loads hosted web app; no local DB |
| `desktop/offline` | Electron `electron/onprem` | Offline | Embedded Postgres; `OnlineStatus` for license sync |
| `shared` | All | — | `apiBase` (`resolveApiUrl` / optional `VITE_API_ORIGIN`) |

Native Electron processes live under repo-root `electron/` (see `electron/README.md`):

- `electron/cloud` → **desktop · online**
- `electron/onprem` → **desktop · offline**

Feature screens stay in `src/features/` — they are shared across web and Electron.

There is **no Capacitor / phone app** in this codebase.
