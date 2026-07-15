import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Pill,
  Row,
  Spacer,
  Stack,
  Stat,
  Table,
  Text,
  useCanvasState,
  useHostTheme,
} from "cursor/canvas";

type Sev = "critical" | "high" | "medium" | "low";

type Finding = {
  id: string;
  sev: Sev;
  area: string;
  location: string;
  title: string;
  detail: string;
};

const FINDINGS: Finding[] = [
  {
    id: "C1",
    sev: "critical",
    area: "Auth",
    location: "server/routes/auth.ts:256-280",
    title: "Forgot-password returns live reset token",
    detail:
      "Public endpoint returns resetToken/resetUrl when email exists. Knowing an email = account takeover. Also breaks anti-enumeration.",
  },
  {
    id: "C2",
    sev: "critical",
    area: "SQL / Backup",
    location: "server/routes/audit.ts:140-146",
    title: "Backup restore SQL injection via column names",
    detail:
      "Object.keys(row) from JSON body interpolated into INSERT. Any authenticated user can restore; no Admin check.",
  },
  {
    id: "C3",
    sev: "critical",
    area: "Tenant isolation",
    location: "server/index.ts:145-151 + pg-db.ts:820-828",
    title: "FORCE RLS does not protect query path",
    detail:
      "setTenantContext runs fire-and-forget on a different pool connection with transaction-local set_config. Handlers use pool.query() with no app.tenant_id.",
  },
  {
    id: "C4",
    sev: "critical",
    area: "Tenant isolation",
    location: "server/index.ts:134-154",
    title: "Platform JWT can target any tenant via X-Tenant-ID",
    detail:
      "X-Tenant-ID overwrite only when decoded.tenantId exists. Super-admin tokens lack tenantId, so a platform JWT can call tenant APIs with arbitrary header.",
  },
  {
    id: "C5",
    sev: "critical",
    area: "Authz",
    location: "server/routes/* (many)",
    title: "Incomplete RBAC — Vendor/Staff can mutate",
    detail:
      "permissions JSON is UI-only. Missing blockVendors/requireAdmin on customers, banks, warranties, orders, quotations, rewards, backup restore, products/batch, add-stock.",
  },
  {
    id: "C6",
    sev: "critical",
    area: "Data integrity",
    location: "server/routes/vendors.ts:176-185",
    title: "DELETE /vendors/all wipes tenant-wide data",
    detail:
      "Staff can hit it. Deletes ALL product_distribution / quotations / orders / payments for the tenant — not scoped to deleted vendors.",
  },
  {
    id: "C7",
    sev: "critical",
    area: "Concurrency",
    location: "server/routes/sales.ts:79-128",
    title: "Double-sell race on barcode",
    detail:
      "SELECT status then UPDATE without FOR UPDATE / status guard on UPDATE. Concurrent POSTs on same barcode can both succeed.",
  },
  {
    id: "C8",
    sev: "critical",
    area: "Pool / Reliability",
    location: "server/routes/distribution.ts:254-269, 326",
    title: "Pool double-release on early exits",
    detail:
      "client.release() before return, then finally releases again — pool corruption under stock/overpay errors.",
  },
  {
    id: "C9",
    sev: "critical",
    area: "Frontend",
    location: "src/App.tsx:248-273",
    title: "Hooks after early return — crash on /privacy|/terms",
    detail:
      "Privacy/Terms returns before later useState/useEffect. Navigating to/from those routes changes hook count → React crash.",
  },
  {
    id: "C10",
    sev: "critical",
    area: "Electron",
    location: "electron/onprem/main.ts:72-80",
    title: "XSS via executeJavaScript + licenseStatus",
    detail:
      "Cloud heartbeat strings interpolated into executeJavaScript. Compromised heartbeat can run code in renderer with electronAPI.",
  },
  {
    id: "C11",
    sev: "critical",
    area: "Frontend auth",
    location: "src/App.tsx:78-100",
    title: "Super Admin UI gated on unsigned JWT decode",
    detail:
      "decodeJwtPayload only base64-decodes. Fake localStorage token with role super_admin renders full SuperAdminApp shell.",
  },
  {
    id: "H1",
    sev: "high",
    area: "Authz",
    location: "server/routes/auth.ts + finance/sales",
    title: "Vendor portal not scoped to vendorId",
    detail:
      "Login returns vendorId but JWT omits it. List/finance/sales never filter by vendor — Vendor JWT sees all tenant vendor data.",
  },
  {
    id: "H2",
    sev: "high",
    area: "Auth",
    location: "server/middleware/auth.ts:41-86",
    title: "Password-change JWT invalidation is a no-op",
    detail:
      "authMiddleware checks async after next() and does nothing. authMiddlewareStrict exists but is never mounted.",
  },
  {
    id: "H3",
    sev: "high",
    area: "Auth",
    location: "server/routes/auth.ts:60-71, 262",
    title: "Cross-tenant email collision on login/reset",
    detail:
      "Email lookup is global LIMIT 1 with no tenant/slug. Same email in two tenants → nondeterministic login and reset target.",
  },
  {
    id: "H4",
    sev: "high",
    area: "Auth",
    location: "server/index.ts:141-144 vs auth.ts:86-95",
    title: "Subscription expiry logic disagrees with login",
    detail:
      "Global gate uses subscription_ends_at || trial_ends_at. Login checks by status. Active tenants with stale trial_ends_at get locked out after login.",
  },
  {
    id: "H5",
    sev: "high",
    area: "Concurrency",
    location: "server/routes/rewards.ts:114-154",
    title: "Reward redemption race / ledger drift",
    detail:
      "Balance check then decrement without txn/FOR UPDATE → double-redeem. PUT/DELETE don’t adjust vendors.total_reward_points.",
  },
  {
    id: "H6",
    sev: "high",
    area: "Finance",
    location: "server/routes/finance.ts:148-183",
    title: "Multi-batch payment not transactional; wrong response id",
    detail:
      "Loop of pool.query INSERTs without BEGIN. Response id is a new uid, not the inserted payment id(s).",
  },
  {
    id: "H7",
    sev: "high",
    area: "Invoices",
    location: "invoices.ts + invoice-finance.ts",
    title: "Invoice status vocabulary conflict + overpay",
    detail:
      "Create uses draft; payments/schema use unpaid. Payments can overpay. Invoice numbers via COUNT+1 race.",
  },
  {
    id: "H8",
    sev: "high",
    area: "Purchases",
    location: "server/routes/purchases.ts:129-158",
    title: "Purchases don’t create inventory / stock",
    detail:
      "Records product_purchases only — no inventory rows or stock increment. Purchased goods aren’t sellable.",
  },
  {
    id: "H9",
    sev: "high",
    area: "Warranties",
    location: "server/routes/warranties.ts:75-77, 157-189",
    title: "Wrong barcode lookup; silent replacement failure",
    detail:
      "Looks up products.barcode not product_inventory.barcode. PUT creates replacements with catch-only failure while returning success.",
  },
  {
    id: "H10",
    sev: "high",
    area: "Frontend",
    location: "LoginScreen.tsx:80-85 + App.tsx:236-242",
    title: "Login drops permissions; unknown role → full UI",
    detail:
      "Client stores user without permissions until profile refresh. getAccess fallthrough returns full for unknown roles.",
  },
  {
    id: "H11",
    sev: "high",
    area: "XSS",
    location: "InvoicesView / ProductVerificationView / AccountsView",
    title: "Print HTML XSS (unsanitized document.write)",
    detail:
      "Customer/vendor names and terms written raw. billTemplates has esc() — invoices/verification don’t use it.",
  },
  {
    id: "H12",
    sev: "high",
    area: "Electron",
    location: "electron/onprem/main.ts:205-208",
    title: "openExternal with no URL allowlist",
    detail:
      "Any window.open from renderer (or XSS) opens arbitrary URLs including file: / custom schemes.",
  },
  {
    id: "H13",
    sev: "high",
    area: "Electron",
    location: "electron/onprem/pg-manager.ts:17-44",
    title: "Hardcoded local Postgres password",
    detail: "dg_user:dg_local_pass on localhost:5433. Any local process can read tenant DB.",
  },
  {
    id: "H14",
    sev: "high",
    area: "Electron",
    location: "electron/onprem/license-store.ts:13-36",
    title: "Weak unauthenticated license encryption",
    detail:
      "Key = SHA256(hostname|platform|username). AES-CBC without HMAC → predictable key + malleable ciphertext.",
  },
  {
    id: "H15",
    sev: "high",
    area: "Electron",
    location: "electron/onprem/main.ts:155-178",
    title: "complete-setup trusts renderer license payload",
    detail:
      "Wizard can inflate maxUsers / alter company fields before provision. Main should re-validate with cloud.",
  },
  {
    id: "H16",
    sev: "high",
    area: "Products",
    location: "server/routes/products.ts:306, 489",
    title: "batch / add-stock missing blockVendors",
    detail:
      "POST /products has blockVendors; batch and add-stock do not. Error paths also leak Error.message.",
  },
  {
    id: "H17",
    sev: "high",
    area: "Tenancy",
    location: "server/utils/tenant.ts:88-102",
    title: "deleteTenant incomplete vs FKs",
    detail:
      "Missing standalone_invoices / invoice_payments (no ON DELETE CASCADE). Delete can fail mid-txn or leave orphans.",
  },
  {
    id: "M1",
    sev: "medium",
    area: "Auth",
    location: "server/routes/auth.ts:18-47 + tenant.ts:52-56",
    title: "Bootstrap signup dead / race",
    detail:
      "provisionTenant always inserts Admin, so signup rejects. Token clear not atomic with insert → concurrent claim race.",
  },
  {
    id: "M2",
    sev: "medium",
    area: "Plans",
    location: "server/utils/planLimits.ts",
    title: "Plan limits incomplete + fail-open",
    detail:
      "checkPlanLimit only on product create. Vendors/users unconstrained. catch returns null (allow).",
  },
  {
    id: "M3",
    sev: "medium",
    area: "Distribution",
    location: "server/routes/distribution.ts:276-289",
    title: "Bulk INSERT not chunked (~5.4k units)",
    detail: "12 params/row hits 65535 limit. Products path already chunks at 5000.",
  },
  {
    id: "M4",
    sev: "medium",
    area: "Super-admin",
    location: "server/routes/super-admin.ts:826-830",
    title: "Reset password missing tenant_id",
    detail:
      "UPDATE users WHERE id = $2 only. Composite PK (id, tenant_id) — same id across tenants all get new hash.",
  },
  {
    id: "M5",
    sev: "medium",
    area: "On-prem",
    location: "server/routes/onprem.ts",
    title: "Weak keys, no rate limit, provision ignores key",
    detail:
      "~48-bit license keys; activate/heartbeat public; provision only checks localhost + DEPLOYMENT_MODE.",
  },
  {
    id: "M6",
    sev: "medium",
    area: "API client",
    location: "src/api.ts:134-202, 296-306",
    title: "15s GET cache + experimental QUERY method",
    detail:
      "Stale UI after mutations. Analytics uses method QUERY — fails silently on older browsers/proxies.",
  },
  {
    id: "M7",
    sev: "medium",
    area: "Payroll",
    location: "server/routes/payroll.ts:15-206",
    title: "Payments keyed by staff name string",
    detail:
      "Rename orphans history; delete removes by name. GET /staff has 4 correlated subqueries per row.",
  },
  {
    id: "M8",
    sev: "medium",
    area: "Security headers",
    location: "server/index.ts:59, 74-78",
    title: "CSP unsafe-inline; CORS reflects Origin off-prod",
    detail:
      "Weak XSS containment. Non-production CORS allows any Origin with credentials if NODE_ENV mis-set.",
  },
  {
    id: "M9",
    sev: "medium",
    area: "DB TLS",
    location: "server/pg-db.ts:44-46",
    title: "rejectUnauthorized: false for managed DB",
    detail: "Disables cert verification for Render/Neon/DATABASE_SSL — MITM if network hostile.",
  },
  {
    id: "M10",
    sev: "medium",
    area: "Frontend",
    location: "src/lib/session.ts + views",
    title: "Tokens in localStorage; racey list loads",
    detail:
      "XSS steals session. Feature views lack AbortController — stale responses overwrite newer state.",
  },
  {
    id: "L1",
    sev: "low",
    area: "UX / Docs",
    location: "LoginScreen / PrivacyPolicy / Settings",
    title: "Remember-me no-op; privacy copy wrong; password min mismatch",
    detail:
      "Remember me never written. Privacy claims localStorage clears on tab close. Settings allows 6-char vs 8-char reset.",
  },
  {
    id: "L2",
    sev: "low",
    area: "Architecture",
    location: "App.tsx payroll lazy import",
    title: "PayrollView loaded but never routed",
    detail: "Dead nav path; easy to assume payroll is in main tabs and ship incomplete RBAC.",
  },
];

const AREA_ROWS = [
  ["Auth / sessions", "3", "3", "1"],
  ["Tenant isolation / RLS", "2", "1", "0"],
  ["RBAC / Vendor portal", "2", "1", "1"],
  ["SQL / Backup / Finance", "2", "4", "2"],
  ["Concurrency / Pool", "2", "1", "1"],
  ["Frontend (React)", "2", "2", "2"],
  ["Electron / On-prem", "1", "4", "1"],
];

export default function SplenderFullCodeReview() {
  const theme = useHostTheme();
  const [filter, setFilter] = useCanvasState<"all" | Sev>("filter", "all");

  const counts = {
    critical: FINDINGS.filter((f) => f.sev === "critical").length,
    high: FINDINGS.filter((f) => f.sev === "high").length,
    medium: FINDINGS.filter((f) => f.sev === "medium").length,
    low: FINDINGS.filter((f) => f.sev === "low").length,
  };

  const shown =
    filter === "all" ? FINDINGS : FINDINGS.filter((f) => f.sev === filter);

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <H1>Dhandho / splender-inventry — full code review</H1>
        <Text tone="secondary" size="small">
          Scope: server/, src/, electron/ · {FINDINGS.length} findings · main @ a5791a5 (clean
          tree)
        </Text>
      </Stack>

      <Callout tone="danger" title="Highest leverage">
        Stop returning password-reset tokens, fix backup restore SQL injection, reject platform
        JWTs on tenant APIs, and fix distribution pool double-release before shipping more
        features.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.critical)} label="Critical" tone="danger" />
        <Stat value={String(counts.high)} label="High" tone="warning" />
        <Stat value={String(counts.medium)} label="Medium" tone="info" />
        <Stat value={String(counts.low)} label="Low" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Findings by area</CardHeader>
          <CardBody>
            <Table
              headers={["Area", "Crit", "High", "Med"]}
              rows={AREA_ROWS}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>What’s solid</CardHeader>
          <CardBody>
            <Stack gap={8}>
              <Text size="small">
                JWT alg pinned HS256; startup fatals for DATABASE_URL / JWT_SECRET; bcrypt cost
                12; parameterized SQL on normal CRUD; composite PKs (id, tenant_id); tenant JWT
                overwrites X-Tenant-ID; Helmet + login rate limits; distribution stock uses FOR
                UPDATE SKIP LOCKED; Electron contextIsolation + no nodeIntegration; billTemplates
                HTML escaping.
              </Text>
              <Text size="small" tone="secondary">
                Isolation today is almost entirely application WHERE tenant_id — treat RLS as
                aspirational until withTenantClient (or a non-owner DB role) is on every path.
              </Text>
            </Stack>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <Stack gap={12}>
        <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
          <H2>All findings</H2>
          <Spacer />
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Pill>
          <Pill active={filter === "critical"} onClick={() => setFilter("critical")}>
            Critical
          </Pill>
          <Pill active={filter === "high"} onClick={() => setFilter("high")}>
            High
          </Pill>
          <Pill active={filter === "medium"} onClick={() => setFilter("medium")}>
            Medium
          </Pill>
          <Pill active={filter === "low"} onClick={() => setFilter("low")}>
            Low
          </Pill>
        </Row>

        <Table
          headers={["Sev", "ID", "Area", "Location", "Finding"]}
          rows={shown.map((f) => [
            f.sev.toUpperCase(),
            f.id,
            f.area,
            f.location,
            `${f.title} — ${f.detail}`,
          ])}
          rowTone={shown.map((f) =>
            f.sev === "critical" ? "danger" : f.sev === "high" ? "warning" : undefined
          )}
        />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>Recommended fix order</H2>
        <Grid columns={2} gap={12}>
          <Card>
            <CardHeader trailing={<Pill size="sm">P0</Pill>}>Ship blockers</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">1. Forgot-password: no token in response</Text>
                <Text size="small">2. Backup restore: column allowlist + requireAdmin</Text>
                <Text size="small">3. Reject platform JWT on tenant APIs</Text>
                <Text size="small">4. Distribution double-release</Text>
                <Text size="small">5. App.tsx hooks before early returns</Text>
                <Text size="small">6. Electron executeJavaScript → ipc send</Text>
              </Stack>
            </CardBody>
          </Card>
          <Card>
            <CardHeader trailing={<Pill size="sm">P1</Pill>}>Next sprint</CardHeader>
            <CardBody>
              <Stack gap={6}>
                <Text size="small">7. Consistent blockVendors / requireAdmin on all mutations</Text>
                <Text size="small">8. vendorId in JWT + server filters</Text>
                <Text size="small">9. Sales FOR UPDATE; reward redeem txn</Text>
                <Text size="small">10. Wire authMiddlewareStrict or token version</Text>
                <Text size="small">11. Print HTML escape everywhere</Text>
                <Text size="small">12. Align expiry checks; login by tenant slug</Text>
              </Stack>
            </CardBody>
          </Card>
        </Grid>
      </Stack>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Companion notes from recent security/perf commits (bootstrap signup dead, plan limits only
        on products, distribution bulk param overflow) are included as M1–M3.
      </Text>
    </Stack>
  );
}
