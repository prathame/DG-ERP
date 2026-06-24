# Demo Data Scripts

Scripts to populate the database with industry-specific demo data for presentations.

## Available Demos

### Pump Manufacturing (Splendor Pump LLP)

```bash
npm run demo:reset
```

- 15 vendors, 10 products (400+ units), 20 customers
- Submersible pumps, monoblock pumps, borewells, solar controllers
- Distributions with discounts, payments, sales, warranties

### Silver Jewellery (Shree Silver Jewellers)

```bash
npm run demo:jewellery
```

- 12 vendors, 12 products (705 units), 15 customers
- Anklets, chains, rings, bangles, necklaces, earrings, pooja thalis
- GST at 3% (jewellery rate), HSN 7113/7114
- Distributions with discounts, payments, sales, warranties

## Commands

| Command | Description |
|---|---|
| `npm run demo:seed` | Load pump manufacturing data |
| `npm run demo:jewellery` | Clear + load jewellery data |
| `npm run demo:clear` | Clear everything |
| `npm run demo:reset` | Clear + load pump data |

## Clear All Data

```bash
npm run demo:clear
```

Removes everything, keeps only:
- Owner vendor (system requirement)
- Admin user (`admin@splendor.com` / `admin123`)

## Switching Between Demos

To switch from pump demo to jewellery demo (or vice versa):

```bash
# Switch to jewellery
npm run demo:jewellery

# Switch back to pumps
npm run demo:reset
```

Each command clears all data first, then loads fresh demo data. Restart the server after switching.

## Login Credentials

**Admin:** `admin@splendor.com` / `admin123`

**Vendor logins** are auto-created. Format: `{email from vendor data}` / `{companyname}@123`

Example (pumps): `rajesh@electricals.com` / `rajeshelectricals@123`
Example (jewellery): `ramesh@laxmijewellers.com` / `laxmijewellers@123`
