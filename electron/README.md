# Electron (native desktop processes)

**Unified desktop** (`desktop/`): one installer. First launch picks Online or Offline once.

| Folder | Role |
|--------|------|
| `desktop/` | Unified entry — mode latch + picker → online or offline boot |
| `cloud/` | Online boot (`boot.ts`) + legacy thin-client helpers |
| `onprem/` | Offline boot (`boot.ts`) — Express + embedded Postgres + wizard |
| `shared/` | Shared constants / helpers |

Build:

```bash
npm run build:electron:desktop:mac   # → dist-electron/desktop/*.dmg
npm run build:electron:desktop:win   # → dist-electron/desktop/*.exe
```

Evergreen release tag: `dhandho-desktop` (Mac arm64/x64 DMGs + Windows x64 exe).

Renderer platform code: `src/platforms/desktop/`.  
Phone Capacitor: `src/platforms/service-mobile/` / unified phone shell.

Public downloads: **`/download`**.
