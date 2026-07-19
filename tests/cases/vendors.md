# Vendors — Test Cases

Covers vendor creation with portal toggle, auto-login credential generation, credential sharing via WhatsApp and Email, vendor editing, deletion, and vendor portal login.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Add vendor with Vendor Portal ON | Open Vendors > Add Vendor with Vendor Portal toggle ON; fill details including email; save | Vendor is created with auto-generated login credentials |
| 1b | Email optional | Add Vendor/Client with name (+ phone) only — leave email blank; save | Saves successfully; no login credentials generated without email |
| 2 | Add vendor with Vendor Portal OFF | Open Vendors > Add Vendor with Vendor Portal toggle OFF; fill details; save | Vendor is created without login credentials; portal fields are hidden |
| 3 | Auto-generated login credentials | Create a vendor with Vendor Portal ON | Username and temporary password are generated and displayed |
| 4 | Share credentials via WhatsApp | After creating vendor, click "Share via WhatsApp" | WhatsApp opens with pre-filled message containing vendor login URL and credentials |
| 5 | Share credentials via Email | After creating vendor, click "Share via Email" | Email client opens with pre-filled subject and body containing login info |
| 6 | Edit vendor details | Open a vendor; modify name, phone, or address; save | Vendor details are updated in the list |
| 7 | Delete vendor | Click Delete on a vendor; confirm deletion | Vendor is removed; distributed products remain but vendor association is cleared |
| 8 | Vendor logs in to portal | Vendor navigates to portal URL; enters auto-generated credentials | Vendor dashboard loads showing only their distributed products and sales |
