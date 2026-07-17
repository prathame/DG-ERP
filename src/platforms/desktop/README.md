# Desktop (Electron)

| Folder | Electron process | Mode |
|--------|------------------|------|
| `online/` | `electron/cloud` | Thin client → hosted ERP (needs internet) |
| `offline/` | `electron/onprem` | Full local stack; UI helpers for sync / license |

Renderer UI for on-prem connection lives in `offline/OnlineStatus.tsx`.
Cloud desktop has little renderer-specific code — it loads the same web UI.
