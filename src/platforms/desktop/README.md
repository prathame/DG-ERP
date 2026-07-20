# Desktop (Electron)

One installer (`electron/desktop`). First launch chooses Online or Offline once.

| Folder | Mode | Electron |
|--------|------|----------|
| `online/` | Cloud ERP (after Online latch) | `electron/cloud/boot.ts` |
| `offline/` | Local Postgres + Express (after Offline latch) | `electron/onprem/boot.ts` + `OnlineStatus.tsx` |

Mode latch lives in the main process (`userData/desktop-mode.json`), not in this renderer folder.
