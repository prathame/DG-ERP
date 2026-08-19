# Global Financial Year Filter — Test Cases

Covers system-wide Financial Year (FY) behavior across Sales, Distribution, Expenses, and Staff Salary, including persistence and API-level filtering.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | FY selection applies globally | Open Analytics; select a different FY; navigate to Sales, Distribution, Purchases → Expenses, and Staff Salary | All modules load data only for the selected FY range |
| 2 | Sales list respects FY range | Select FY A; note sales count. Switch to FY B where known data differs | Sales list/count changes to match FY B data only |
| 3 | Distribution records respect FY range | Select FY A; open Distribution list and batch list | Only distributions with `distributionDate` inside FY A are shown |
| 4 | Distribution summary respects FY range | Select FY A; open Distribution summary cards | Summary totals (distributed/sold/replaced/damaged) are computed only from FY A records |
| 5 | Expenses list respects FY range | Select FY A; open Purchases → Expenses | Expense rows are limited to expense dates within FY A |
| 6 | Staff list totals respect FY range | Select FY A; open Staff master list | `totalPaid`, `paymentCount`, and `lastPayment` reflect only FY A payroll entries |
| 7 | Staff payment history respects FY range | Select a staff member after selecting FY A | Payment history excludes entries outside FY A |
| 8 | Payroll summary respects FY range | Open Analytics payroll summary after selecting FY A | `grandTotal`, `byStaff`, and `byMonth` align with FY A date range |
| 9 | FY persistence after refresh | Select FY A; refresh browser/app | Selected FY remains active and the same filtered data is shown |
| 10 | FY persistence across tab switches | Select FY A; switch multiple tabs/modules | FY context remains unchanged; no module reverts to all-time data |
| 11 | Explicit date override still works | In any module that supports explicit from/to input, set custom dates different from FY | Module uses explicit from/to values for that request and returns matching custom-range data |
| 12 | Vendor-scoped user + FY | Log in as vendor user; select FY A; open Distribution/Sales views | Vendor data stays scoped to that vendor and also to FY A date range |
| 13 | Empty-state handling for FY with no data | Select FY where tenant has no data in one module | Module shows clean empty state (no crash, no stale previous data) |
| 14 | Boundary-date inclusion | Create/use records exactly on FY start date and FY end date | Boundary records are included in filtered results |

