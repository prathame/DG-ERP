# Desktop · unified Electron

One installer. First launch picks **Online** (cloud) or **Offline** (on-prem) once.

| Path | Role |
|------|------|
| `main.ts` | Latch → picker → `bootOnline` / `bootOffline` |
| `mode-store.ts` | `userData/desktop-mode.json` one-time latch |
| `picker/` | HTML mode chooser (before ERP UI) |
| `../cloud/boot.ts` | Online window → hosted ERP |
| `../onprem/boot.ts` | Offline: embedded Postgres + Express |

Change mode later: reinstall the app.
