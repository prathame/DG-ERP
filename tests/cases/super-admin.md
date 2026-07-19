# Super Admin — Test Cases

Covers super-admin authentication, tenant CRUD, feature toggle management, plan management, and audit logging.

## Authentication (4)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Super admin login with valid credentials | Navigate to `/super-admin/login`; enter correct email and password | Dashboard loads; session token is stored |
| 2 | Super admin login with wrong password | Enter correct email but wrong password | Error message "Invalid credentials" is shown; no session created |
| 3 | Super admin login with non-admin account | Enter a regular tenant user's credentials | Access denied message; user is not logged in to super-admin panel |
| 4 | Super admin logout | Click Logout button from super-admin dashboard | Session cleared; redirected to super-admin login page |

## Tenant Management (13)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 5 | View tenant list | Log in as super admin; open Tenant Management | Table of all tenants is displayed with name, slug, plan, status |
| 6 | Create tenant with valid data | Click "Add Tenant"; fill name, slug, admin email, plan; submit | Tenant is created; appears in tenant list |
| 7 | Create tenant with duplicate slug | Try creating a tenant with an existing slug | Validation error: "Slug already exists" |
| 8 | Create tenant with empty required fields | Leave name or slug empty; submit | Validation errors for required fields |
| 9 | Edit tenant name | Click Edit on a tenant; change name; save | Tenant name is updated in the list |
| 10 | Edit tenant plan | Click Edit on a tenant; change plan; save | Plan is updated; tenant's feature access adjusts accordingly |
| 11 | Deactivate tenant | Click Deactivate on an active tenant | Tenant status changes to Inactive; tenant users cannot log in |
| 12 | Reactivate tenant | Click Activate on an inactive tenant | Tenant status changes to Active; tenant users can log in again |
| 13 | Delete tenant | Click Delete on a tenant; confirm deletion | Tenant and all associated data are removed |
| 14 | Search tenants | Type a tenant name in the search box | Tenant list filters to matching results |
| 15 | Sort tenants by name | Click the Name column header | Tenants are sorted alphabetically (toggle asc/desc) |
| 16 | Sort tenants by creation date | Click the Created column header | Tenants are sorted by creation date (toggle asc/desc) |
| 17 | Tenant detail view | Click on a tenant row | Detail panel shows tenant info, admin users, usage stats |

## Feature Toggles (10)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 18 | View feature toggles for a tenant | Open tenant detail; go to Feature Toggles tab | All toggles listed with current ON/OFF state |
| 19 | Enable Barcode feature | Toggle Barcode to ON for a tenant | Barcode feature becomes available for that tenant |
| 20 | Disable Barcode feature | Toggle Barcode to OFF for a tenant | Barcode-related tabs/fields are hidden for that tenant |
| 21 | Enable Vendor Portal | Toggle Vendor Portal to ON | Vendor Portal features are accessible for that tenant |
| 22 | Disable Vendor Portal | Toggle Vendor Portal to OFF | Vendor portal login and vendor management are hidden |
| 23 | Enable Warranty feature | Toggle Warranty to ON | Warranty fields appear in Sales and Verification |
| 24 | Disable Warranty feature | Toggle Warranty to OFF | Warranty fields are hidden throughout the tenant |
| 25 | Enable Rewards feature | Toggle Rewards to ON | Reward points logic activates for that tenant |
| 26 | Disable Rewards feature | Toggle Rewards to OFF | Reward points fields/columns are hidden |
| 27 | Toggle changes persist after refresh | Toggle a feature; refresh the page | Toggle state remains as set |

## Plan Management (4)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 28 | View plan list | Navigate to Plan Management | All plans (Free, Pro, Enterprise) are listed with limits |
| 29 | Edit plan limits | Edit a plan's product limit or user limit; save | Plan limits are updated |
| 30 | Assign plan to tenant | Change a tenant's plan from Free to Pro | Tenant's feature access and limits update to Pro tier |
| 31 | Downgrade tenant plan | Change a tenant from Pro to Free | Tenant loses access to Pro-only features; data is retained |

## Audit Log (5)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 32 | View audit log | Navigate to Audit Log section | Log entries with timestamp, user, action, and details are listed |
| 33 | Filter audit log by tenant | Select a tenant from the filter dropdown | Only entries for that tenant are shown |
| 34 | Filter audit log by date range | Set a start and end date | Only entries within that date range are shown |
| 35 | Filter audit log by action type | Select action type (e.g., "Tenant Created") | Only matching action entries are shown |
| 36 | Audit log entry for tenant creation | Create a new tenant; check audit log | Entry with "Tenant Created" action and tenant details is present |

## Platform Analytics (4)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 37 | Cloud analytics tab | Open Analytics; leave Cloud selected | MRR / tenants / growth cards load; Cloud and On-Prem toggles still work |
| 38 | On-Prem analytics tab | Switch to On-Prem | License health + version control panel; Cloud/On-Prem unchanged |
| 39 | Offline Mobile analytics tab | Switch to Offline Mobile | Total / online / offline / expiring soon + version & status charts; banner notes no ERP KPIs |
| 40 | Offline Mobile analytics API shape | As SA, `GET /api/super-admin/service-mobile-analytics` | JSON has `total`, `online`, `offline`, `expiringSoon`, `versionDistribution`, `statusBreakdown`, `expiryTimeline`; no revenue/collections fields |
