# Bill Customization — Test Cases

Covers invoice branding (logo, color, tagline), numbering prefix, bank details, terms and conditions, signatory settings, field visibility toggles, live preview, logo size validation, and section-level visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Upload company logo | Open Bill Customization; upload a logo image; save | Logo appears on invoice header in preview and printed invoices |
| 2 | Set brand color | Select a brand color from color picker; save | Invoice accent color (headers, borders) updates to selected color |
| 3 | Set tagline | Enter a company tagline; save | Tagline appears below the company name on invoices |
| 4 | Set invoice number prefix | Enter a prefix (e.g., "INV-"); save | All new invoices use the prefix in their invoice number |
| 5 | Add bank details | Enter bank name, account number, IFSC code; save | Bank details section appears on invoices for payment reference |
| 6 | Add Terms & Conditions | Enter T&C text; save | Terms & Conditions section appears at the bottom of invoices |
| 7 | Set authorized signatory | Enter signatory name and upload signature image; save | Signatory name and signature appear on invoices |
| 8 | Hide barcode on invoice | Toggle "Show Barcode" OFF; save | Product barcodes are not printed on invoices |
| 8b | Show HSN/SAC (Offline default OFF) | Settings → Bill Customization → toggle "Show HSN/SAC" ON; save; open invoice create | HSN/SAC inputs appear on line items; PDF includes HSN/SAC column. With toggle OFF, neither form nor PDF shows HSN/SAC |
| 9 | Hide warranty info on invoice | Toggle "Show Warranty" OFF; save | Warranty details are not printed on invoices |
| 10 | Live preview updates | Change any setting (logo, color, tagline) | Preview panel updates in real time without saving |
| 11 | Logo size limit enforcement | Try uploading a logo larger than the allowed size (e.g., > 2 MB) | Validation error: "Logo must be under 2 MB" |
| 12 | Section hidden when Bill Customization OFF | Disable Bill Customization feature toggle; check navigation | Bill Customization section is not visible in settings/nav |
