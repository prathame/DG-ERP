# Multi-Language — Test Cases

Covers default language, language switching to Hindi and Gujarati, persistence across sessions, per-tab language scope, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Default language is English | Log in to a new account; check UI labels | All UI text is in English by default |
| 2 | Switch to Hindi | Open Settings > Language; select Hindi | Shell chrome updates immediately: bottom nav (Analytics/Masters/Invoice/Quotes/More), sidebar section labels, Sync Now, Settings headers |
| 3 | Switch to Gujarati | Open Settings > Language; select Gujarati | Primary hubs update: Analytics KPIs/ranges, Masters pills/empty states, Invoices/Quotes list chrome and New Invoice/New Quote |
| 4 | Language preference persists | Switch to Hindi; reload the app (or log out/in) | Language remains Hindi (`dhandho_lang` in localStorage); chrome stays translated after reload |
| 5 | Language is scoped per tab | Set Hindi in Tab 1; open Tab 2 with English | Each tab respects its own language setting independently |
| 6 | Language selector hidden when feature OFF | Disable Multi-Language feature toggle; check Settings | Language selection option is not visible |
| 7 | Deep forms stay English (acceptable) | Switch to Hindi; open a long invoice create form | Nav/titles/actions translate; deep field labels may remain English (partial coverage by design) |
