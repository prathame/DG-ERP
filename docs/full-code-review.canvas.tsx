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

const CLOSED = [
  "C1 Deleted-user JWT rejected",
  "C2/H13 Backup export + settings requireAdmin",
  "C3 Distribution pool double-release",
  "H5 Product create ROLLBACK on early exit",
  "H3 Restore only clears allowlisted tables",
  "H4 deleteTenant no longer hits transactions",
];

const FINDINGS: Finding[] = [
  {
    id: "H1",
    sev: "critical",
    area: "Authz",
    location: "vendors/finance/distribution/sales GET",
    title: "Vendor horizontal IDOR",
    detail:
      "Only GET /api/sales scopes JWT vendorId. Vendors can still read all vendors, finance, distribution, sale bills, validate via query vendorId, warranties/rewards.",
  },
  {
    id: "H2",
    sev: "high",
    area: "Authz",
    location: "server mutations + App.tsx tabs",
    title: "Module permissions UI-only",
    detail:
      "Staff with finance:hidden can still POST finance/sales/payroll. Tab content renders on activeTab without canAccess.",
  },
  {
    id: "H6",
    sev: "high",
    area: "Authz",
    location: "invoice-finance / replacements / accounts notes",
    title: "Mutations missing blockVendors",
    detail:
      "Vendor JWT can create/delete invoice payments, replacements, credit/debit notes.",
  },
  {
    id: "H8",
    sev: "high",
    area: "Money",
    location: "accounts.ts:115-141",
    title: "P&L double-counts distribution + sales",
    detail:
      "totalRevenue adds dist billed value and product_sales for the same goods.",
  },
  {
    id: "H9",
    sev: "high",
    area: "Concurrency",
    location: "quotations.ts:154-174",
    title: "Quotation convert TOCTOU stock race",
    detail:
      "Inventory selected outside txn without FOR UPDATE — concurrent converts can claim same barcodes.",
  },
  {
    id: "H10",
    sev: "high",
    area: "XSS",
    location: "Invoices/Finance/Verification/PriceList/Barcode/utils",
    title: "Print/PDF XSS outside billTemplates",
    detail:
      "Unescaped document.write fields; saveBillAsPdf injects customerName into <title>.",
  },
  {
    id: "H11",
    sev: "high",
    area: "Frontend RBAC",
    location: "LoginScreen + App.tsx mobile/menu",
    title: "Login drops permissions; nav bypasses",
    detail:
      "permissions omitted on login; profile fetch only on mount. Mobile falls back to unfiltered navItems; Settings always in menu/Cmd+K.",
  },
  {
    id: "H12",
    sev: "high",
    area: "Electron",
    location: "pg-manager + preload + onprem/main.js",
    title: "Hardcoded PG password; wizard IPC; stale main.js",
    detail:
      "dg_local_pass in source. activate/completeSetup on main preload. Packaged main.js still has executeJavaScript XSS (TS fixed).",
  },
  {
    id: "H7",
    sev: "medium",
    area: "Finance",
    location: "invoice-finance.ts + finance.ts:190-195",
    title: "Invoice overpay; payment response invents ID",
    detail:
      "No cap vs grand_total. Response id is a fresh uid, not inserted payment id(s).",
  },
  {
    id: "M1",
    sev: "medium",
    area: "Auth",
    location: "middleware/auth.ts requireRole",
    title: "Role checks trust JWT not live DB role",
    detail: "Demotion ineffective until 24h token expiry.",
  },
  {
    id: "M2",
    sev: "medium",
    area: "Auth",
    location: "auth.ts login",
    title: "Login slug still optional",
    detail: "Without slug, email LIMIT 1 is cross-tenant nondeterministic.",
  },
  {
    id: "M3",
    sev: "medium",
    area: "Plans",
    location: "planLimits.ts:48-49",
    title: "Plan limits fail-open",
    detail: "catch returns null — creates allowed past caps on DB errors.",
  },
  {
    id: "M4",
    sev: "medium",
    area: "RLS",
    location: "pg-db.ts",
    title: "RLS advisory only",
    detail: "No FORCE; pool owner bypasses. App WHERE tenant_id is the real boundary.",
  },
  {
    id: "M5",
    sev: "medium",
    area: "On-prem",
    location: "onprem.ts deactivate",
    title: "Deactivate unrate-limited",
    detail: "Knowing licenseKey+machineId clears binding; activate/heartbeat are limited.",
  },
  {
    id: "M6",
    sev: "medium",
    area: "Distribution",
    location: "distribution delete + apply-billing",
    title: "Delete orphans payments; apply-billing not transactional",
    detail: "vendor_payments left for batch_id. Per-row updates can partial-apply.",
  },
  {
    id: "M7",
    sev: "medium",
    area: "Electron",
    location: "openExternal + license-store + cloud URL",
    title: "No URL allowlist; weak license crypto; CLOUD_URL drift",
    detail:
      "Any window.open URL opens externally. AES-CBC no MAC. main.js vs main.ts origins differ.",
  },
  {
    id: "M8",
    sev: "medium",
    area: "Money",
    location: "rewards.ts + accounts day-book",
    title: "Reward ledger drift; payment sign flip",
    detail:
      "Manual earn doesn’t bump vendor counter. Day-book vs ledger disagree on vendor payment sign.",
  },
  {
    id: "L1",
    sev: "low",
    area: "Session",
    location: "session.ts",
    title: "Tokens in localStorage",
    detail: "XSS steals full session — worsens print XSS impact.",
  },
];

export default function SplenderCodeReviewV3() {
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
        <H1>Dhandho — code review (v3)</H1>
        <Text tone="secondary" size="small">
          Post-P0 pass · uncommitted fixes on disk · {FINDINGS.length} open ·
          e2e_by_type 493/493
        </Text>
      </Stack>

      <Callout tone="success" title="P0 closed this session">
        {CLOSED.join(" · ")}
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.critical)} label="Critical" tone="danger" />
        <Stat value={String(counts.high)} label="High" tone="warning" />
        <Stat value={String(counts.medium)} label="Medium" tone="info" />
        <Stat value={String(counts.low)} label="Low" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Highest remaining risk</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">1. Vendor IDOR across most GETs (H1)</Text>
              <Text size="small">2. Permissions not enforced server-side (H2/H6)</Text>
              <Text size="small">3. Print XSS outside billTemplates (H10)</Text>
              <Text size="small">4. P&L double-count + quotation race (H8/H9)</Text>
              <Text size="small">5. Electron secrets / stale main.js (H12)</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>What’s solid</CardHeader>
          <CardBody>
            <Text size="small">
              HS256 JWT, deleted-user reject, platform token isolation,
              backup Admin+allowlist, sales FOR UPDATE, distribution SKIP
              LOCKED, billTemplates esc(), contextIsolation, CORS allowlist.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <Stack gap={12}>
        <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
          <H2>Open findings</H2>
          <Spacer />
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>
            All
          </Pill>
          <Pill
            active={filter === "critical"}
            onClick={() => setFilter("critical")}
          >
            Critical
          </Pill>
          <Pill active={filter === "high"} onClick={() => setFilter("high")}>
            High
          </Pill>
          <Pill
            active={filter === "medium"}
            onClick={() => setFilter("medium")}
          >
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
            f.sev === "critical"
              ? "danger"
              : f.sev === "high"
                ? "warning"
                : undefined
          )}
        />
      </Stack>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Next P0 candidates: H1 vendor-scope helper · H6 blockVendors · H10 print
        esc · rebuild onprem main.js from TS.
      </Text>
    </Stack>
  );
}
