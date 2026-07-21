# Authentication & Login — Test Cases

Covers branded and generic login flows, credential validation, rate limiting, vendor login, session management, logout, token handling, and password reset/change workflows.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Branded login page loads | Navigate to `/{tenant-slug}/login` | Login page shows tenant logo, name, and branded colors |
| 2 | Generic login page loads | Navigate to `/login` | Generic login page loads without tenant branding |
| 3 | Login with valid credentials | Enter correct email and password in desktop or mobile app; click Login | User is authenticated; redirected to dashboard |
| 3b | Browser login blocked | Open tenant login URL in a normal browser and submit credentials | `403 APP_ONLY` — message to use desktop or mobile app |
| 4 | Login with wrong password | Enter correct email but wrong password | Error message "Invalid email or password" is shown |
| 5 | Login with non-existent email | Enter an email that does not exist; submit | Error message "Invalid email or password" is shown (no email enumeration) |
| 6 | Rate limiting after failed attempts | Enter wrong password 5 times in a row | Account is temporarily locked; message "Too many attempts, try again later" |
| 7 | Vendor login when Vendor Portal ON | Navigate to vendor login URL with Vendor Portal enabled | Vendor login page loads; vendor can log in with credentials |
| 8 | Vendor login when Vendor Portal OFF | Navigate to vendor login URL with Vendor Portal disabled | Access denied or login page not found |
| 9 | Single-device: second login kicks first | Log in as Raju on Desktop A; log in as Raju on Desktop/Mobile B | B works; A gets `SESSION_REPLACED` alert (“signed in on another device”) and returns to login within ~45s (or on next API call) |
| 9b | Same user re-login on same machine | Log out or re-login on the same desktop/mobile install | New session replaces the old one; login succeeds |
| 10 | Logout clears session | Click Logout from user menu | Server session row cleared; local token removed; user redirected to login |
| 11 | Token expiry forces re-login | Wait for JWT token to expire (or manually expire it) | User is redirected to login page with "Session expired" message |
| 12 | Forgot password sends reset email | Click "Forgot Password"; enter registered email; submit | Success message "Reset link sent"; email is received |
| 13 | Reset password with valid token | Click reset link from email; enter new password; submit | Password is updated; user can log in with new password |
| 14 | Reset password with expired/invalid token | Use an expired or tampered reset token | Error message "Invalid or expired reset link" |
| 15 | Change password from profile | Go to Profile > Change Password; enter old password and new password; submit | Password is updated; confirmation message shown |
