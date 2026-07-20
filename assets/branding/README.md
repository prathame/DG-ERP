# Dhandho Cap brand icons

Source masters for Android / iOS / web launcher icons.

| File | Use |
|------|-----|
| `icon-light.png` | Light launcher (white bg, navy D, orange dot) |
| `icon-dark.png` | Dark / night launcher (navy bg, white D, orange dot) |
| `icon-mark-light.png` | Transparent navy mark (adaptive foreground, light) |
| `icon-mark-dark.png` | Transparent white mark (adaptive foreground, night) |
| `icon-monochrome.png` | Android 13+ themed / monochrome silhouette |
| `AppIcon-1024-light.png` / `AppIcon-1024-dark.png` | iOS 1024 masters |
| `icon-*-source.png` | Original Canva exports |

Regenerate densities:

```bash
python3 scripts/generate-brand-icons.py
```

Requires Pillow (`pip install pillow`).
