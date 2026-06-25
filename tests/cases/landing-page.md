# Landing Page — Test Cases

Covers the public-facing landing page including hero section, feature highlights, pricing plans, contact form, dark mode toggle, legal pages, and invalid URL handling.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Hero section renders | Open `/` in browser | Hero heading, subheading, and CTA button are visible |
| 2 | CTA button navigates to signup | Click the primary CTA button on hero | User is redirected to the signup / registration page |
| 3 | Features section lists all features | Scroll to the features section | All feature cards (Inventory, Sales, Distribution, etc.) are displayed with icons and descriptions |
| 4 | Pricing section shows plans | Scroll to pricing section | Free, Pro, and Enterprise plan cards are visible with correct prices and feature lists |
| 5 | Pricing plan CTA works | Click "Get Started" on a pricing card | User is navigated to the corresponding signup flow for that plan |
| 6 | Contact form renders all fields | Scroll to contact section | Name, Email, Message fields and Submit button are visible |
| 7 | Contact form validates required fields | Leave all fields empty and click Submit | Validation errors appear for Name, Email, and Message |
| 8 | Contact form validates email format | Enter "invalid-email" in Email field and submit | Validation error indicates email format is invalid |
| 9 | Contact form submits successfully | Fill all fields with valid data and submit | Success toast/message appears; form resets |
| 10 | Dark mode toggle works | Click the dark mode toggle on the landing page | Page switches to dark theme; colors, backgrounds, and text contrast update correctly |
| 11 | Privacy Policy page loads | Click "Privacy Policy" link in footer | `/privacy` page loads with privacy policy content |
| 12 | Terms of Service page loads | Click "Terms of Service" link in footer | `/terms` page loads with terms content |
| 13 | Invalid slug shows 404 | Navigate to `/random-nonexistent-slug` | 404 / "Page Not Found" message is displayed |
