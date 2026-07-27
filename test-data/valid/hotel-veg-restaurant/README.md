# Vegetarian restaurant sample CSVs

Sample hospitality masters for an **Indian vegetarian restaurant**. No meat, fish, or egg dishes.

Suggested import order in the hotel desktop app:

1. **Floor → Import** — `tables.csv`
2. **Menu → Dishes → Import dishes** — `menu-items.csv` (missing modifier groups such as `Spice Level` are created automatically)
3. **Menu → Modifiers → Import modifiers** — `modifiers.csv` (adds options into those groups; optional if you only need empty groups)
4. **Members → Plans → Import** — `membership-plans.csv` (optional)

Group names in `menu-items.csv` `modifierGroups` match `modifiers.csv` `groupName` (case-insensitive). Dish import creates any missing groups so you do not need to switch tabs first.

These replace the old auto-seeded demo floor/menu. New hotel tenants start empty.
