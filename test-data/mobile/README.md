# Cap phone seed CSVs (Import → tap Print / WhatsApp / Backup)

Copy these onto the phone under **Documents/Dhandho/import/** (this install pushes them via adb).

## Import order (Offline Cap, service UX)

1. **Masters → Clients → Import CSV** → `01-clients.csv`
2. **Masters → Prices → Import** → `02-prices.csv` (creates sellable items + generic prices)
3. **Quotes → Import CSV** → `03-quotations.csv`  
   - `Q-PAGED` = 24 lines (multi-page print/WhatsApp PDF)  
   - `Q-SHORT` = 2-line quote for a quick WhatsApp check

Then:

- **Invoice WhatsApp:** Invoice tab → New Invoice → client **City Cafe** → add a few priced items → Save → WhatsApp  
  (or open an existing invoice if you already have one)
- **Quotation WhatsApp:** Quotes → open **Q-PAGED** (or the imported quote) → WhatsApp
- **Backup:** More → Settings → Backup → confirm toast path `Documents/Dhandho/backups/…` → My Files → Documents → Dhandho → backups
