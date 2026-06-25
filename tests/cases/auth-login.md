# Authentication & Login — Test Cases

Covers branded and generic login flows, credential validation, rate limiting, vendor login, session management, logout, token handling, and password reset/change workflows.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Branded login page loads | Navigate to `/{tenant-slug}/login` | Login page shows tenant logo, name, and branded colors |
| 2 | Generic login page loads | Navigate to `/login` | Generic login page loads without tenant branding |
| 3 | Login with valid credentials | Enter correct email and password; click Login | User is authenticated; redirected to dashboard |
| 4 | Login with wrong password | Enter correct email but wrong password | Error message "Invalid email or password" is shown |
| 5 | Login with non-existent email | Enter an email that does not exist; submit | Error message "Invalid email or password" is shown (no email enumeration) |
| 6 | Rate limiting after failed attempts | Enter wrong password 5 times in a row | Account is temporarily locked; message "Too many attempts, try again later" |
| 7 | Vendor login when Vendor Portal ON | Navigate to vendor login URL with Vendor Portal enabled | Vendor login page loads; vendor can log in with credentials |
| 8 | Vendor login when Vendor Portal OFF | Navigate to vendor login URL with Vendor Portal disabled | Access denied or login page not found |
| 9 | Session is scoped per tab | Log in as User A in Tab 1; log in as User B in Tab 2 | Each tab maintains its own session independently |
| 10 | Logout clears session | Click Logout from user menu | Session token is removed; user is redirected to login page |
| 11 | Token expiry forces re-login | Wait for JWT token to expire (or manually expire it) | User is redirected to login page with "Session expired" message |
| 12 | Forgot password sends reset email | Click "Forgot Password"; enter registered email; submit | Success message "Reset link sent"; email is received |
| 13 | Reset password with valid token | Click reset link from email; enter new password; submit | Password is updated; user can log in with new password |
| 14 | Reset password with expired/invalid token | Use an expired or tampered reset token | Error message "Invalid or expired reset link" |
| 15 | Change password from profile | Go to Profile > Change Password; enter old password and new password; submit | Password is updated; confirmation message shown |
