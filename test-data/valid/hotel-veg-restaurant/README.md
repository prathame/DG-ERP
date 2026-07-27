# Vegetarian restaurant sample CSVs

Sample hospitality masters for an **Indian vegetarian restaurant**. No meat, fish, or egg dishes.

Import order in the hotel desktop app (Menu shows **Dishes** first — switch to **Modifiers** before importing dishes):

1. **Floor → Import** — `tables.csv`
2. **Menu → Modifiers → Import modifiers** — `modifiers.csv` (creates groups like `Spice Level`)
3. **Menu → Dishes → Import dishes** — `menu-items.csv` (references those group names exactly)
4. **Members → Plans → Import** — `membership-plans.csv` (optional)

Group names in `menu-items.csv` `modifierGroups` must match `modifiers.csv` `groupName` (case-insensitive). Import modifiers before dishes or dish import will fail.

These replace the old auto-seeded demo floor/menu. New hotel tenants start empty.
