# DG ERP — Demo Flow Guide

Step-by-step guide to demonstrate the full platform.

---

## Prerequisites

```bash
# Terminal 1 — API server
npm run server

# Terminal 2 — Frontend
npm run dev
```

> App runs at http://localhost:3000

---

## 1. Super Admin Portal

1. Open **http://localhost:3000/admin**
2. Login: `admin@spre.ai` / `superadmin123`
3. Show the **Dashboard** — total tenants, users, revenue across all companies
4. Show **Plans** — 4 subscription tiers (Trial, Starter, Professional, Enterprise)

## 2. Onboard a Tenant

1. Go to **Tenants** → Click **Create Tenant**
2. Fill:
   - Company Name: `Splendor Pump LLP`
   - Admin Email: `admin@splendor.com`
   - Admin Name: `Rajesh Kumar`
   - Phone: `9876543210`
   - Plan: Professional
3. After creation, show the **credentials screen**:
   - Login URL: `http://localhost:3000/splendor-pump-llp` (with copy button)
   - Email + Password (with copy buttons)
   - Click **WhatsApp** → opens WhatsApp with credentials message
   - Click **Email** → opens email client with credentials
4. Show how tenant appears in the tenant list with status "Active"

## 3. Branded Tenant Login

1. Open a **new browser tab**
2. Go to **http://localhost:3000/splendor-pump-llp**
3. Show the branded login page — company name, logo (letter icon initially), accent color
4. Point out "Powered by DG ERP" at the bottom
5. Login with the tenant admin credentials from step 2

## 4. Tenant ERP Tour

After login, walk through each section:

| Tab | What to Show |
|---|---|
| **Dashboard** | KPI cards, charts, company name in sidebar |
| **Inventory** | Add a product (name, price, barcode prefix, quantity) |
| **Sales Entry** | Scan barcode → enter customer → save sale → print invoice |
| **Distribution** | Spreadsheet-style distribution to vendor, per-row discount + GST toggle |
| **Masters** | Vendors (auto-creates login), Customers, Banks |
| **Finance** | Vendor payment tracking, record payment, WhatsApp reminder |
| **Warranty** | Auto-created warranties from sales (if enabled) |
| **Rewards** | Vendor reward points earned per sale (if enabled) |

## 5. Bill Customization

1. Go to **Settings** → scroll to **Bill Customization**
2. Upload a **company logo** (any PNG/JPG under 500KB)
3. Change **accent color** using the color picker
4. Add **tagline**: "Premium Pump Manufacturers Since 1995"
5. Add **invoice prefix**: `SPL-INV-`
6. Fill **bank details** (account name, number, bank, IFSC, UPI)
7. Add **terms & conditions**: "Goods once sold will not be returned"
8. Add **signatory name**: "Rajesh Kumar, Managing Director"
9. Click **Preview** — show the fully customized sample invoice in popup
10. Click **Save Bill Settings**
11. Now create a sale and **print bill** — show the custom branding applied

## 6. Split Billing (GST + Non-GST)

1. Go to **Distribution** → distribute products to a vendor
2. Check GST toggle on some rows, leave others unchecked
3. Click **Save & Print GST Bill** — shows only GST items with CGST/SGST breakdown
4. Click **Save & Print Non-GST Bill** — shows only non-GST items

## 7. Dark Mode

1. Go to **Settings** → **Appearance**
2. Toggle **Dark Mode** on — entire UI switches to dark theme
3. Navigate through tabs to show it works everywhere
4. Toggle back to light mode

## 8. Feature Toggles

1. Go to **Settings** → **Feature Toggles**
2. Turn off **Warranty Management** → Warranty tab disappears from sidebar
3. Turn off **Rewards & Points** → Rewards tab disappears
4. Turn back on to restore

## 9. Vendor Login (Multi-Role)

1. Go to **Masters** → **Vendors** → Add a vendor with phone number
2. Note the auto-generated credentials shown in the popup
3. Open a **new browser tab** (important: new tab = separate session)
4. Go to **http://localhost:3000/splendor-pump-llp**
5. Login as the vendor — show limited sidebar (no Inventory, no Accounts)
6. Vendor can see their own sales, distributions, finance

## 10. ERP Chatbot

1. Click the **chat bubble** (bottom-right corner)
2. Try these commands:
   - `sales today` — today's sales count and revenue
   - `low stock` — products with stock below 10
   - `top vendors` — best performing vendors
   - `search pump` — find products matching "pump"
   - `help` — show all available commands

## 11. Generic Login (No Slug)

1. Open **http://localhost:3000** (no slug in URL)
2. Show the generic "DG ERP" login — no company branding
3. Login with the same tenant admin email
4. After login, URL automatically updates to `/splendor-pump-llp`

## 12. Invalid Company URL

1. Go to **http://localhost:3000/random-company**
2. Show the "Company Not Found" error page
3. Click "Go to DG ERP Home" → redirects to `/`

## 13. Multi-Tenant Isolation

1. Go back to **http://localhost:3000/admin** (super admin)
2. Create a **second tenant**: "Radhe Krishan Jewellers"
3. Open **http://localhost:3000/radhe-krishan-jewellers** in another tab
4. Login as the second tenant admin
5. Show that the second tenant has **zero products, zero sales** — completely isolated data
6. Each tenant has their own branded login, bill settings, and data

## 14. WhatsApp Integration

1. Create a sale with a customer phone number
2. Enable **WhatsApp Auto-Send** in Settings
3. Create another sale — WhatsApp opens automatically with bill text
4. Or manually click the WhatsApp icon on any bill to share

## 15. Audit Log (Super Admin)

1. Go to **http://localhost:3000/admin** → **Audit Log** tab
2. Show all actions across tenants — logins, creates, updates, deletes
3. Use **Action filter** — select "Login" to see only login events
4. Use **Entity filter** — select "Tenant" to see tenant management actions
5. Use **Search** — type a user name or tenant name
6. Show pagination — 30 entries per page

## 16. Feature Toggles (Super Admin)

1. Go to **Tenants** → Click a tenant → Scroll to **Feature Toggles**
2. Toggle **off** "Warranty Management" → save
3. Switch to tenant login → Warranty tab disappears
4. Toggle **off** "AI Chatbot" → chat widget disappears
5. Toggle **off** "Multi-Language" → language selector hidden in Settings
6. Show all 7 toggles: Warranty, Replacement, Rewards, Finance, Chatbot, Bill Customization, Multi-Language

## 17. PWA — Install as App (Mobile)

1. Open the tenant URL on **mobile Chrome** (e.g., `https://dg-erp.onrender.com/test`)
2. Chrome shows **"Add to Home Screen"** banner (or tap ⋮ menu → "Add to Home Screen")
3. App icon appears on phone home screen — tap to open
4. Show it opens **full screen** (no browser bar, no tabs)
5. Show the **bottom navigation bar** with 5 tabs + "More"
6. Disconnect internet → show the **offline page** with "Retry" button

## 18. Database Backup

1. Go to tenant **Settings** → **Data Management**
2. Click **Download Backup** — downloads a JSON file with all tenant data

---

## Quick Demo (5 Minutes)

If short on time, show only these:

1. Super admin creates tenant at `/admin`
2. Branded login at `/{slug}`
3. Add product → Make sale → Print customized bill
4. Dark mode toggle
5. Audit log with filters
6. Feature toggles (disable warranty → tab disappears)

---

## Demo Credentials Cheatsheet

| Role | URL | Email | Password |
|---|---|---|---|
| Super Admin | `/admin` | `admin@spre.ai` | `superadmin123` |
| Tenant Admin | `/{slug}` | Set during creation | Auto-generated |
| Vendor | `/{slug}` | Auto-created | `{vendorName}@123` |

---

## Load Demo Data (Optional)

To pre-populate with realistic data instead of starting empty:

```bash
npm run demo:seed          # Pump manufacturing company
npm run demo:jewellery     # Silver jewellery company
```

> Note: Demo data uses the legacy SQLite setup. For PostgreSQL multi-tenant, create tenants via super admin.
