# Finance — Test Cases

Covers financial summary dashboard, payment recording, payment method options, WhatsApp payment reminders, payment history tracking, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Financial summary displays correctly | Open Finance section | Summary shows total revenue, outstanding payments, and collected amounts |
| 2 | Record a payment | Select a vendor/customer with outstanding balance; enter amount; select method; save | Payment is recorded; outstanding balance decreases accordingly |
| 3 | Payment methods available | Open Record Payment form; click payment method dropdown | Options include Cash, Bank Transfer, UPI, Cheque, and other configured methods |
| 4 | Send WhatsApp payment reminder | Select a vendor/customer with overdue payment; click "Send Reminder" | WhatsApp opens with pre-filled reminder message including amount and due details |
| 5 | Payment history displays | Open payment history for a vendor/customer | All past payments are listed with date, amount, method, and reference |
| 6 | Finance section hidden when feature OFF | Disable Finance feature toggle; check navigation | Finance tab/section is not visible in the sidebar/nav |
