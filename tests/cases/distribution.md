# Distribution — Test Cases

Covers product distribution to vendors, per-row discounts and GST, challan printing, split billing for GST/non-GST items, GST calculation accuracy, batch distribution, and summary views.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Distribute products to vendor | Select vendor; add products with quantities; click "Distribute" | Products are marked as Distributed; vendor association is recorded |
| 2 | Per-row discount | Add products to distribution; enter a discount percentage on a specific row | Discount is applied only to that row; total reflects the adjusted amount |
| 3 | Per-row GST | Add products to distribution; set GST rate per row | GST is calculated individually per row based on its rate |
| 4 | Print distribution challan | After distributing, click "Print Challan" | Browser print dialog opens with formatted distribution challan |
| 5 | Split bill — GST items | Distribute a mix of GST and non-GST items | GST items are grouped into a separate invoice/challan with tax breakdown |
| 6 | Split bill — non-GST items | Distribute a mix of GST and non-GST items | Non-GST items are grouped into a separate invoice/challan without tax lines |
| 7 | GST calculation accuracy | Distribute a product with price 1000 and GST 18% | CGST = 90, SGST = 90, Total = 1180 (or IGST = 180 for inter-state) |
| 8 | Batch distribution | Select multiple products at once; assign to a vendor; distribute | All selected products are distributed in a single transaction |
| 9 | Distribution summary | Open Distribution Summary/History | Summary table shows all distributions with vendor, date, product count, and total value |
