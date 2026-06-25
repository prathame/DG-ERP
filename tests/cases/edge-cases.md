# Edge Cases — Test Cases

Covers empty states, boundary conditions for text and numbers, special characters, multi-tab behavior, page refresh persistence, browser navigation, and print dialog handling.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Empty inventory state | Log in to a new tenant with no products | Empty state message "No products yet" with an "Add Product" CTA is shown |
| 2 | Empty sales state | Open Sales with no sales recorded | Empty state message "No sales yet" is shown |
| 3 | Empty vendor list state | Open Vendors with no vendors added | Empty state message "No vendors yet" with an "Add Vendor" CTA is shown |
| 4 | Long product name display | Add a product with a name of 200+ characters | Name is truncated with ellipsis in table view; full name shows on hover/detail |
| 5 | Long company name on invoice | Set a company name of 100+ characters; generate invoice | Name wraps properly; layout does not break |
| 6 | Special characters in fields | Enter names/descriptions with characters like `& < > " ' / \` | Characters are stored and displayed correctly; no rendering or XSS issues |
| 7 | Delete number input to empty | Click into a quantity/price field; select all; press Delete/Backspace | Field becomes empty (not "0" or NaN); validation prompts for value on save |
| 8 | Multiple tabs same tenant | Open the app in 3 browser tabs as the same user | All tabs function independently; data changes in one tab reflect on refresh in others |
| 9 | Page refresh retains state | Navigate to Inventory; add filters; press F5 / refresh | Page reloads to the same view; critical filters or context are preserved |
| 10 | Browser back button behavior | Navigate Dashboard > Inventory > Product Detail; press Back | User returns to Inventory list, then Dashboard; no broken routes |
