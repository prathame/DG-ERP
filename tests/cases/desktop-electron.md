# Desktop Electron (unified Online / Offline)

Manual cases for the unified desktop installer (`electron/desktop`). One Mac/Windows app; first launch picks Online or Offline once.

## Prerequisites

- Built or `npm run electron:desktop:dev:local`
- For Offline: SA On-Prem license key
- For Online: reachable cloud URL (`DG_CLOUD_URL` or production)

---

### DE-01 — First launch shows mode picker

**Priority:** Critical

1. Fresh userData (or delete `desktop-mode.json` + `license.dat` under app userData).
2. Launch desktop app.
3. Expect Online / Offline chooser with confirm step and “cannot switch without reinstalling” warning.

---

### DE-02 — Online latch → cloud ERP

**Priority:** Critical

1. Choose Online → Confirm.
2. Expect hosted ERP (`?desktop=1` / company slug entry). No embedded Postgres wizard.
3. Quit and relaunch — picker must not appear; stays Online.

---

### DE-03 — Offline latch → wizard / local ERP

**Priority:** Critical

1. Fresh install. Choose Offline → Confirm.
2. Expect on-prem setup wizard (license key).
3. Activate with SA-issued key → admin password → ERP at local slug.
4. Sidebar Sync / OnlineStatus visible.
5. Quit and relaunch — no picker; opens local ERP.

---

### DE-04 — Upgrade path skips picker when license.dat exists

**Priority:** High

1. Existing Offline install with `license.dat` but no `desktop-mode.json`.
2. Launch — expect Offline boot (no picker), mode file created as offline.

### DE-04b — Legacy On-Prem userData migration

**Priority:** Critical

1. Have data under Application Support / `%APPDATA%` folder **Dhandho On-Prem** (`license.dat` + `postgres-data`).
2. Fresh unified app userData **Dhandho** (empty).
3. Launch unified desktop — expect migrate copy, Offline latch (no picker), same company data.

---

### DE-05 — Cannot flip mode in-app

**Priority:** High

1. After Online latch, confirm there is no Settings control to switch to Offline.
2. Changing mode requires reinstall (documented in picker).

---

### DE-06 — Download page lists Mac + Windows

**Priority:** Medium

1. Open `/download`.
2. Desktop section shows Mac Apple Silicon, Mac Intel, and Windows x64 evergreen links (or SA overrides).
