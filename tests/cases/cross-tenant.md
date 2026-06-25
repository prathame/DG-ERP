# Cross-Tenant Isolation — Test Cases

Covers strict data isolation between tenants for products, sales, vendors, finance, audit logs, bill customization settings, and barcodes.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Products are isolated | Log in as Tenant A; view Inventory; log in as Tenant B; view Inventory | Each tenant sees only their own products; no overlap |
| 2 | Sales are isolated | Log in as Tenant A; view Sales; log in as Tenant B; view Sales | Each tenant sees only their own sales records |
| 3 | Vendors are isolated | Log in as Tenant A; view Vendors; log in as Tenant B; view Vendors | Each tenant sees only their own vendors |
| 4 | Finance records are isolated | Log in as Tenant A; view Finance; log in as Tenant B; view Finance | Each tenant sees only their own financial data |
| 5 | Audit logs are isolated | Log in as Tenant A; view Audit Log; log in as Tenant B; view Audit Log | Each tenant sees only their own audit entries |
| 6 | Bill customization is isolated | Tenant A sets logo and color; Tenant B checks Bill Customization | Tenant B sees their own settings, not Tenant A's |
| 7 | Barcodes are isolated | Tenant A adds a product with barcode "12345"; Tenant B searches "12345" | Tenant B gets "Not found"; barcode does not leak across tenants |
