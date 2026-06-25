# Settings — Test Cases

Covers profile editing, company details, GST configuration, dark mode, language switching, feature toggle visibility (read-only), WhatsApp auto-send, data backup, and activity logging.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Edit user profile | Open Settings > Profile; change name or phone; save | Profile details are updated; changes reflect across the app |
| 2 | Update company name | Open Settings > Company; change company name; save | Company name updates on dashboard, invoices, and branding |
| 3 | Update GST number | Open Settings > Company; enter or change GSTIN; save | GST number appears on all GST invoices |
| 4 | Set default GST rate | Open Settings > Tax; set default GST rate (e.g., 18%); save | New products and sales default to the configured GST rate |
| 5 | Toggle dark mode | Open Settings > Appearance; toggle Dark Mode | App switches to dark theme; preference persists on refresh |
| 6 | Switch language to Hindi | Open Settings > Language; select Hindi | All UI labels switch to Hindi |
| 7 | Switch language to Gujarati | Open Settings > Language; select Gujarati | All UI labels switch to Gujarati |
| 8 | Feature toggles are read-only | Open Settings > Features | Feature toggles are displayed but cannot be modified by tenant users (managed by super admin) |
| 9 | WhatsApp auto-send toggle | Open Settings > Notifications; toggle "Auto-send WhatsApp"; save | When enabled, WhatsApp messages are sent automatically on sale/distribution |
| 10 | Data backup / export | Open Settings > Backup; click "Export Data" | Data export file (CSV/JSON) is downloaded containing tenant data |
| 11 | Activity log displays | Open Settings > Activity Log | List of recent user actions (login, product added, sale made) with timestamps |
