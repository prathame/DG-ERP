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

const SKIPPED = [
  "FORCE RLS",
  "Weak on-prem license key",
  "Tokens in localStorage",
];

const STILL_SOLID = [
  "v6/v7 vendor scopes on finance/batches/products/dashboard-stats/sale-bill/CRM",
  "Live role refresh + authMiddleware no-clobber",
  "enforceModulePermissions (partial — gaps below)",
  "Print esc · openExternal http(s) · invoice FOR UPDATE",
  "Price-lists blockVendors · reward counters · backup admin",
];

/** Fresh pass after v7 fixes — deferred excluded. */
const FINDINGS: Finding[] = [
  {
    id: "H1",
    sev: "high",
    area: "IDOR",
    location: "distribution.ts bill / einvoice / ewaybill",
    title: "Vendor IDOR on dist bill + e-docs",
    detail:
      "GET /distribution/bill, /einvoice, /ewaybill accept any vendorId/batchId. Vendor has distribution:view but no assertVendorAccess — leaks barcodes, prices, GST, challan of other vendors. Batch detail is scoped; these three were missed.",
  },
  {
    id: "H2",
    sev: "high",
    area: "Authz",
    location: "permissions.ts PATH_MODULE gaps",
    title: "Unmapped APIs skip module gate",
    detail:
      "/banks, /staff, /suppliers, /chatbot (and masters/categories) are not in PATH_MODULE → next(). Vendor/Warehouse can read bank accounts, staff salaries, suppliers, and run chatbot over tenant-wide data. /payroll is gated; /staff is not.",
  },
  {
    id: "H3",
    sev: "high",
    area: "IDOR",
    location: "dashboard.ts analytics + rewards-summary",
    title: "Vendor sees tenant-wide analytics",
    detail:
      "/analytics/* and /dashboard/rewards-summary map to dashboard (Vendor view) but query all sales/invoices/payments/expenses/vendors. /dashboard/stats is scoped; these are not.",
  },
  {
    id: "H4",
    sev: "high",
    area: "IDOR",
    location: "invoice-finance.ts:9,45",
    title: "Vendor can read B2B invoice finance",
    detail:
      "/invoice-finance → finance (Vendor view). Summary + client GETs return all clients, invoice totals, payment history. Mutations correctly blockVendors — GETs do not.",
  },
  {
    id: "M1",
    sev: "medium",
    area: "IDOR",
    location: "distribution.ts:62-70",
    title: "Unlinked Vendor lists all distributions",
    detail:
      "jwtVendorId || query.vendorId — if role=Vendor but vendorId null, filter omitted (or client-supplied). Other routes 403 unlinked Vendors.",
  },
  {
    id: "M2",
    sev: "medium",
    area: "Money",
    location: "finance.ts vendor payments",
    title: "Vendor payment allocation race",
    detail:
      "Multi-batch payment reads dues then inserts without FOR UPDATE. Concurrent posts can over-allocate. Invoice finance locks; this path does not.",
  },
  {
    id: "L1",
    sev: "low",
    area: "Errors",
    location: "chatbot.ts:445",
    title: "Chatbot 500 returns String(err)",
    detail: "Leaks internal exception text in JSON error field.",
  },
  {
    id: "L2",
    sev: "low",
    area: "Authz",
    location: "masters.ts + products categories",
    title: "Minor ungated GETs",
    detail:
      "/api/masters/counts and /api/categories also absent from PATH_MODULE (low sensitivity vs H2).",
  },
  {
    id: "L3",
    sev: "low",
    area: "XSS",
    location: "SuperAdminBilling.tsx",
    title: "Print title missing esc",
    detail:
      "invoiceNumber interpolated unescaped in print HTML; tenantName/notes already use esc. Admin-only.",
  },
];

export default function SplenderCodeReviewV8() {
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
        <H1>Dhandho — full code review (v8)</H1>
        <Text tone="secondary" size="small">
          Fresh pass after v7 fixes · dirty tree on 7ee283f ·{" "}
          {FINDINGS.length} open · deferred excluded
        </Text>
      </Stack>

      <Callout tone="neutral" title="Skipped (deferred)">
        {SKIPPED.join(" · ")}
      </Callout>

      <Callout tone="success" title="Prior fixes still hold">
        {STILL_SOLID.join(" · ")}
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.critical)} label="Critical" tone="danger" />
        <Stat value={String(counts.high)} label="High" tone="warning" />
        <Stat value={String(counts.medium)} label="Medium" tone="info" />
        <Stat value={String(counts.low)} label="Low" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Fix order</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                1. assertVendorAccess on dist bill / einvoice / ewaybill (H1)
              </Text>
              <Text size="small">
                2. Extend PATH_MODULE: banks, staff, suppliers, chatbot (H2)
              </Text>
              <Text size="small">
                3. Vendor-scope analytics + rewards-summary (H3)
              </Text>
              <Text size="small">
                4. blockVendors on invoice-finance GETs (H4)
              </Text>
              <Text size="small">
                5. Unlinked Vendor 403 + payment FOR UPDATE (M1–M2)
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Theme</CardHeader>
          <CardBody>
            <Text size="small">
              Remaining risk is incomplete Vendor scoping on secondary
              distribution/finance reads, plus PATH_MODULE coverage holes —
              not a regression of the core v6/v7 fixes.
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
            f.sev === "high" ? "warning" : undefined
          )}
        />
      </Stack>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Verified on disk · e2e not re-run this pass · deferred items not listed.
      </Text>
    </Stack>
  );
}
