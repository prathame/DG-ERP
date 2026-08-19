# Chatbot — Test Cases

Covers chatbot opening, live-data queries (sales, stock, invoices, vendors), product search, how-to help, and feature-toggle visibility. The assistant is rule-based (no LLM).

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Open chatbot | Click the chatbot icon/button on the dashboard | Chatbot panel opens with a welcome message, quick-action chips, and input field |
| 2 | Ask "Sales today" | Type "Sales today" in chatbot and send | Chatbot responds with today's total sales count and revenue |
| 3 | Ask "Low stock" | Type "Low stock" or "Products running low" and send | Chatbot lists products with InStock barcodes under 10 |
| 4 | Ask "Top vendors" | Type "Top vendors" and send | Chatbot lists vendors ranked by sales volume or distribution count |
| 5 | Search product by name | Type "Search [product name]" and send | Chatbot returns matching product details (name, price, in-stock count) |
| 6 | Ask "Help" | Type "Help" and send | Chatbot displays commands (data + how-to), including dispatch today and unpaid invoices when those tabs are on |
| 7 | Chatbot hidden when feature OFF | Disable Chatbot feature toggle (SA or Settings); check dashboard | Chatbot icon/button is not visible |
| 8 | Dispatch today | Type "dispatch today" and send | Today's dispatch count and value (not “I couldn't find anything”) |
| 9 | Unpaid invoices | Type "unpaid invoices" and send | Lists sent/unpaid standalone invoices, or a clear empty message |
| 10 | How to set sale units | Type "how to set sale units" and send | Explains Settings → Bill Customization → Sale Units; notes inventory stays piece/box |
| 11 | How to create invoice | Type "how to create invoice" and send | Explains Invoices → New; unit comes from Bill Settings |
| 12 | Quotations summary | Type "quotations" and send | Counts by status, or a prompt to create one |
| 13 | How to use the app | Type "how to use the app" and send | Points to Settings → How to use (Shop and Accountant) |
