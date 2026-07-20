# Dhandho Cap brand icons

Single orange master for Android / iOS / web launcher icons and in-app branding.

| File | Use |
|------|-----|
| `icon-orange-source.png` | Master Canva export (orange tile, white D + dot) |
| `icon-source.png` | Copy of the orange master |
| `icon-light.png` / `icon-dark.png` | Same orange tile (kept as dual names for older paths) |
| `icon-mark-*.png` | Transparent white mark (adaptive foreground) |
| `icon-monochrome.png` | Android 13+ themed / monochrome silhouette |
| `AppIcon-1024-*.png` | iOS 1024 masters (same orange) |

Regenerate densities + splash + `public/icons`:

```bash
python3 scripts/generate-brand-icons.py
```

Requires Pillow (`pip install pillow`).

Customer bill / tenant logos (`logoBase64`) are separate — do not overwrite those.

## Landing “logo meaning”

| File | Use |
|------|-----|
| `logo-meaning-labeled.png` | Labeled equation (Letter D / Growth / Focus) — also at `public/branding/` |
| `logo-meaning-equation.png` | Same equation without captions |

Shown on the marketing landing page in `#mark` (after Business types).
