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

const CLOSED_THIS_PASS = [
  "C1–C3 Vendor IDOR (finance / batches / rewards / products)",
  "H1 Live role+vendorId from DB",
  "H2 Permissions persist + canAccess gates",
  "H3 Print XSS (invoices, finance, verification, price list, barcodes, accounts)",
  "H4 Electron rebuild + random PG pass + setup guard",
  "H5 Invoice overpay guard",
  "H6 openExternal http(s) only",
  "M1–M3, M5, M8 + L2 (SQL param, login slug, plan fail-closed, batch orphans/txn, errStr, audit admin)",
  "M6 rewards counter bump; M7 CLOUD_URL sync",
];

const FINDINGS: Finding[] = [
  {
    id: "M4",
    sev: "medium",
    area: "RLS",
    location: "pg-db.ts",
    title: "RLS advisory only",
    detail:
      "ENABLE without FORCE; pool owner bypasses. Needs withTenantClient cutover.",
  },
  {
    id: "M7",
    sev: "medium",
    area: "Electron",
    location: "license-store",
    title: "Weak on-prem license key",
    detail:
      "AES key derived from hostname/user — product/crypto decision still open. CLOUD_URL drift fixed.",
  },
  {
    id: "L1",
    sev: "low",
    area: "Session",
    location: "session.ts",
    title: "Tokens in localStorage",
    detail: "XSS → session theft. Needs httpOnly cookie architecture.",
  },
];

export default function SplenderCodeReviewV5() {
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
        <H1>Dhandho — full code review (v5)</H1>
        <Text tone="secondary" size="small">
          Post-fix pass · verified then fixed on top of 46ccf0d ·{" "}
          {FINDINGS.length} deferred · 0 critical / 0 high open
        </Text>
      </Stack>

      <Callout tone="success" title="Closed this pass">
        {CLOSED_THIS_PASS.join(" · ")}
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value={String(counts.critical)} label="Critical" tone="danger" />
        <Stat value={String(counts.high)} label="High" tone="warning" />
        <Stat value={String(counts.medium)} label="Medium" tone="info" />
        <Stat value={String(counts.low)} label="Low" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Deferred on purpose</CardHeader>
          <CardBody>
            <Stack gap={6}>
              <Text size="small">
                M4 FORCE RLS — large withTenantClient migration
              </Text>
              <Text size="small">
                M7 weak license key — product/crypto decision
              </Text>
              <Text size="small">
                L1 httpOnly cookies — auth architecture change
              </Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Solid</CardHeader>
          <CardBody>
            <Text size="small">
              HS256 JWT, live role revalidation, vendorScope helpers, backup
              Admin+allowlist, sales FOR UPDATE, distribution SKIP LOCKED,
              quotation convert lock, billTemplates esc(), contextIsolation,
              CORS allowlist, plan limits fail-closed.
            </Text>
          </CardBody>
        </Card>
      </Grid>

      <Divider />

      <Stack gap={12}>
        <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
          <H2>Still open</H2>
          <Spacer />
          <Pill active={filter === "all"} onClick={() => setFilter("all")}>
            All
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
            f.sev === "medium" ? "warning" : undefined
          )}
        />
      </Stack>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Source: verified against disk before each fix · e2e_by_type after
        restart.
      </Text>
    </Stack>
  );
}
