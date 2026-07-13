# DG Business — Demo Flow Guide

Step-by-step guide to demonstrate the full platform.

---

## Prerequisites

```bash
npm run dev        # Starts frontend + backend together
```

> App runs at http://localhost:3000

---

## 1. Super Admin Portal

1. Open **http://localhost:3000/admin**
2. Login with `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `.env`
3. Show the **Dashboard** — total tenants, users, revenue
4. Show **Plans** — subscription tiers

## 2. Onboard a Tenant

1. Go to **Tenants** → Click **Create Tenant**
2. Fill:
   - Company Name: `Patel Agro Industries`
   - Admin Email: `admin@patelagro.com`
   - Admin Name: `Prathamesh Patel`
   - Phone: `9876543210`
   - **Address**: `Shop 12, APMC Market, Ahmedabad 380006`
   - **GSTIN**: `24AABCA1234L1ZP`
   - **Business Type**: Manufacturer / Dealer / Retail
   - Plan: Trial
3. After creation, show the **credentials screen**:
   - Login URL with copy button
   - Email + Password with copy buttons
   - **WhatsApp** → opens with credentials message
   - **Email** → opens email client
4. Show GSTIN auto-populated in tenant settings

## 3. Branded Tenant Login

1. Open **http://localhost:3000/patel-agro-industries**
2. Show branded login page — company name, accent color
3. Login with tenant admin credentials

## 4. CSV Import Flow (Quick Data Setup)

Import test data from `test-data/valid/` folder:

| Step | File | Where |
|------|------|-------|
| 1 | `vendors.csv` | Dashboard → Vendors → Import CSV |
| 2 | `staff.csv` | Dashboard → Staff → Import CSV |
| 3 | `banks.csv` | Dashboard → Banks → Import CSV |
| 4 | `products.csv` | Inventory → Import CSV |

Then test **invalid imports** from `test-data/invalid/`:
- Show row-level error highlighting
- Show "no items were imported" (all-or-nothing)
- Show specific error messages (invalid phone, duplicate name, bad HSN)

## 5. Inventory Management

1. Show imported products — 10 agro products with stock
2. Point out **GST Incl/Excl badges** — click to toggle
3. Use **Column Picker** (⫶ icon) — toggle columns on/off
4. Use **Sort buttons** — Name / Price / Stock
5. Add a product manually:
   - Enter HSN code `38089190` → show **HSN auto-suggest**: "→ 18% · Insecticides"
   - Check "Price includes GST" checkbox
6. **Delete All** button → confirm dialog → clears inventory

## 6. Distribution / Sales

1. Click **+ Record Sale** (or "+ Distribute" for manufacturers)
2. Select a vendor/customer
3. Add products manually OR click **Import CSV** → upload `test-data/valid/distribution.csv`
4. Show product rows auto-populated from CSV
5. Toggle **GST checkbox** on a GST-inclusive product — watch price update (₹155 → ₹131)
6. Set discount on a row
7. Click **Distribute** → show success
8. Show batch in list with **Paid badge** (if fully paid)

## 7. Standalone Invoices

1. Go to **Invoices** tab (under Finance & Reports)
2. Click **+ New Invoice**
3. Fill customer details (name, GSTIN, address)
4. Add line items with HSN/SAC auto-suggest
5. Show real-time totals
6. Save as **Draft** or **Create & Send**
7. From invoice list:
   - Change **PDF style** dropdown: Modern / Classic (Tally) / Minimal
   - Click **Print** → show different PDF layouts
   - Mark as **Sent** → **Paid**
   - **WhatsApp** share

## 8. Purchases & Expenses

1. Go to **Purchases** tab
2. Add a supplier → record a purchase with **Invoice No.** (for GSTR-2B matching)
3. Switch to **Expenses** section
4. Add expenses (Electricity, Petrol, Rent etc.)
5. Show 12 expense categories

## 9. Staff Management

1. Go to **Dashboard** → **Staff** master
2. Show imported staff with tiles
3. Click a staff member → view payment history
4. Record a **Salary** payment → WhatsApp notification prompt
5. Record an **Advance** → show advance balance tracking
6. **Export CSV** of staff data

## 10. Vendor Finance & Bulk Reminders

1. Go to **Dealer Payments** (or Vendor Payments)
2. Show outstanding balances per vendor
3. Click **Send All Reminders** → confirms count → opens WhatsApp for each vendor
4. Click a vendor → view detail → click **PDF** → print payment history report
5. Go to **Search/Verify** → search vendor name → click → show **Print/PDF** button

## 11. Accounts & Reports

1. Go to **Accounts** tab — show 13 sub-tabs
2. Generate **P&L** statement
3. Generate **Balance Sheet**
4. Show **GSTR-3B** tab:
   - Select month → shows Output Tax, ITC, Net Payable
   - Click **Copy to Clipboard** → paste in GST portal
5. Show **GSTR-2B** tab:
   - Upload a 2B JSON → shows Matched/Mismatch/Books Only/2B Only
   - Color-coded status pills
   - **Export CSV**

## 12. Bill Customization

1. Go to **Settings** → **Bill Customization**
2. Upload company logo
3. Change accent color
4. Add tagline, invoice prefix
5. **Bank details** — select from dropdown (from Bank master)
6. Add terms & conditions, signatory
7. Click **Preview** → show customized invoice

## 13. Search / Verify

1. Go to **Search/Verify** tab
2. Type a vendor name → shows vendor card with payments, distributions
3. Click **Print/PDF** on vendor detail → professional report
4. Type a product name → shows product info
5. Scan a barcode (if barcode system enabled)

## 14. Collapsible Sidebar

1. Show section headers: **Supply Chain**, **Finance & Reports**, **After Sales**
2. Click a section → collapses/expands
3. Show active section highlights in brand color
4. Collapsed state persists across page refreshes

## 15. Command Palette

1. Press **Ctrl+K** (or Cmd+K on Mac)
2. Type "inv" → filters to Inventory
3. Arrow keys to navigate, Enter to jump
4. Show keyboard hints at bottom

## 16. Notification Bell

1. Show bell icon in header with **red badge** (low stock count)
2. Click → goes to Inventory

## 17. Dark Mode

1. Go to **Settings** → toggle dark mode
2. Navigate through tabs to show it works everywhere

## 18. Multi-Tenant Isolation

1. Create a **second tenant** from super admin
2. Login to second tenant → show **zero data** (completely isolated)
3. Explain: shared database + `tenant_id` on every row + **Row Level Security (RLS)**

## 19. Auto-Logout on Suspension

1. From super admin, **suspend** a tenant
2. Switch to tenant tab → next action shows "Account suspended" → auto-logout

## 20. Vendor Portal (Multi-Role)

1. Add a vendor with email
2. Note auto-generated login credentials
3. Open new tab → login as vendor
4. Show limited sidebar — only Dashboard, Distribution, Finance
5. Vendor can view but not edit

---

## Quick Demo (5 Minutes)

1. Super admin creates tenant with GSTIN + business type
2. Import products via CSV (10 agro products)
3. Distribute to vendor (with GST toggle)
4. Show GSTR-3B computation
5. Print invoice with Modern/Classic preset
6. Ctrl+K command palette

---

## Demo Credentials Cheatsheet

| Role | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/admin` | From `.env` | From `.env` |
| Tenant Admin | `/{slug}` | Set during creation | Auto-generated |
| Vendor | `/{slug}` | Auto-created with email | Auto-generated |

---

## Test Data

Pre-built CSV files in `test-data/` folder:

| Folder | Purpose |
|--------|---------|
| `test-data/valid/` | 5 vendors, 7 staff, 10 products, 3 banks, 6 distribution rows — all valid |
| `test-data/invalid/` | Same entities with errors — empty names, bad phones, invalid GSTIN, duplicates, bad HSN |

Import valid first, then invalid to demonstrate error handling.
