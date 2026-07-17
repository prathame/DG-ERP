# Electron (native desktop processes)

Maps to `src/platforms/desktop/`:

| Folder | Platform label | Mode | What it is |
|--------|----------------|------|------------|
| `cloud/` | **desktop · online** | Online | Thin window around hosted ERP (~20MB) |
| `onprem/` | **desktop · offline** | Offline | Bundled React + Express + embedded Postgres |
| `shared/` | — | — | Shared constants / helpers |

Build outputs:

- `dist-electron/cloud/` — desktop online installer
- `dist-electron/onprem/` — desktop offline installer

Renderer (React) platform code lives under `src/platforms/desktop/`.
Mobile Capacitor code lives under `src/platforms/mobile/` (not here).

Public download page (desktop + mobile): **`/download`** — see [`docs/MOBILE.md`](../docs/MOBILE.md) and `src/components/layout/DownloadPage.tsx`.
