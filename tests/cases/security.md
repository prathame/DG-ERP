# Security — Test Cases

Covers JWT validation, token forgery, cross-tenant data access, XSS injection vectors, SQL injection, rate limiting, profile authorization, password policies, and HTTP security headers.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | API request without JWT | Make an API request without the Authorization header | 401 Unauthorized response |
| 2 | API request with expired JWT | Make an API request with an expired token | 401 Unauthorized response with "Token expired" message |
| 3 | Forged tenant ID in JWT | Modify the tenant ID in a JWT payload; send API request | 401/403 response; request is rejected |
| 4 | Cross-tenant data access via API | Authenticated as Tenant A, request Tenant B's products via API | 403 Forbidden or empty result; no Tenant B data is returned |
| 5 | XSS in company name | Enter `<script>alert('xss')</script>` as company name; save; view on invoice | Script tags are escaped/sanitized; no alert executes |
| 6 | XSS in tagline | Enter `<img onerror="alert(1)" src=x>` as tagline; save; view on page | Malicious HTML is escaped; no script executes |
| 7 | XSS in chatbot input | Enter `<script>document.cookie</script>` in chatbot message | Input is sanitized; no script executes; chatbot responds normally |
| 8 | SQL injection in search | Enter `' OR '1'='1` in product search field | No SQL error; search returns no results or handles input safely |
| 9 | Rate limiting on login | Send 20 login requests in 10 seconds | Requests are throttled after the limit; 429 Too Many Requests returned |
| 10 | Rate limiting on API endpoints | Send 100 rapid requests to a data endpoint | Requests are throttled; 429 returned after exceeding rate limit |
| 11 | Unauthorized profile access | As User A, try to access User B's profile endpoint | 403 Forbidden; no data returned |
| 12 | Admin cannot reset another tenant's password | As Tenant A admin, try to reset a Tenant B user's password via API | 403 Forbidden; operation denied |
| 13 | Minimum password length enforcement | Try to set a password shorter than the minimum (e.g., < 8 chars) | Validation error: "Password must be at least 8 characters" |
| 14 | Helmet security headers present | Inspect HTTP response headers of any page | Headers include X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, Content-Security-Policy |
| 15 | Sensitive data not in URL | Complete a login or sale; inspect browser URL bar and history | No passwords, tokens, or sensitive data appear in URLs |
