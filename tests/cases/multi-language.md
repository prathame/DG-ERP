# Multi-Language — Test Cases

Covers default language, language switching to Hindi and Gujarati, persistence across sessions, per-tab language scope, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Default language is English | Log in to a new account; check UI labels | All UI text is in English by default |
| 2 | Switch to Hindi | Open Settings > Language; select Hindi | All UI labels, placeholders, and messages switch to Hindi |
| 3 | Switch to Gujarati | Open Settings > Language; select Gujarati | All UI labels, placeholders, and messages switch to Gujarati |
| 4 | Language preference persists | Switch to Hindi; log out; log back in | Language remains Hindi after re-login |
| 5 | Language is scoped per tab | Set Hindi in Tab 1; open Tab 2 with English | Each tab respects its own language setting independently |
| 6 | Language selector hidden when feature OFF | Disable Multi-Language feature toggle; check Settings | Language selection option is not visible |
