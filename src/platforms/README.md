# Platforms

| Path | Surface |
|------|---------|
| `shared/` | API base URL helpers (web + Electron) |
| `desktop/` | Electron renderer helpers (OnlineStatus after Offline latch) |
| `service-mobile/` | Offline phone stack (PGlite, `DG-SM-` license) |
| `service-cloud/` | Online Cap seats + phone UX helpers |
| `mobileMode.ts` / `PhoneModePicker.tsx` | Unified Cap shell — one-time Online/Offline latch |

## Unified phone shell

One Android + one iOS app (`in.dhandho.service`, Vite mode `service-phone`). At first launch the user picks **Online** or **Offline** once. Stacks stay separate:

- **Offline** — local PGlite ERP, license activate/heartbeat only to cloud
- **Online** — cloud JWT + company slug + device seats; never opens PGlite ERP

Do not merge auth or sync Offline ERP into Online cloud.

## Unified desktop shell

One Mac + Windows Electron installer (`in.dhandho.desktop`). Mode latch is in the **main process** (`userData/desktop-mode.json` + HTML picker) — see `electron/desktop/`. Renderer still uses `deploymentMode: 'cloud' | 'onprem'` from preload after latch.
