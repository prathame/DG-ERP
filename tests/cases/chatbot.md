# Chatbot — Test Cases

Covers chatbot opening, natural language queries for sales, stock levels, vendor rankings, product search, help command, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Open chatbot | Click the chatbot icon/button on the dashboard | Chatbot panel opens with a welcome message and input field |
| 2 | Ask "Sales today" | Type "Sales today" in chatbot and send | Chatbot responds with today's total sales count and revenue |
| 3 | Ask "Low stock" | Type "Low stock" or "Products running low" and send | Chatbot lists products with stock below the configured threshold |
| 4 | Ask "Top vendors" | Type "Top vendors" and send | Chatbot lists vendors ranked by sales volume or distribution count |
| 5 | Search product by name | Type "Search [product name]" and send | Chatbot returns matching product details (name, price, stock, status) |
| 6 | Ask "Help" | Type "Help" and send | Chatbot displays a list of available commands and example queries |
| 7 | Chatbot hidden when feature OFF | Disable Chatbot feature toggle; check dashboard | Chatbot icon/button is not visible |
