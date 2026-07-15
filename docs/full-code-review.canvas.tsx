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

const CLOSED: Finding[] = [
  {
    id: "N1",
    sev: "high",
    area: "Money",
    location: "purchases.ts supplier payments",
    title: "Supplier payments uncapped",
    detail: "Fixed: FOR UPDATE + remaining-balance cap.",
  },
  {
    id: "N2",
    sev: "medium",
    area: "Money",
    location: "finance.ts vendor payments",
    title: "Vendor advances allowed",
    detail: "Fixed: reject amount above total dues; no Advance insert.",
  },
  {
    id: "N3",
    sev: "medium",
    area: "Errors",
    location: "distribution.ts batch edit",
    title: "Catch returned err.message",
    detail: "Fixed: only known validation messages as 400.",
  },
  {
    id: "N4",
    sev: "medium",
    area: "XSS",
    location: "billTemplates.ts",
    title: "Prefixes / packQuantity unescaped",
    detail: "Fixed: esc on prefixes, ids, challan title, packQuantity.",
  },
  {
    id: "N5",
    sev: "medium",
    area: "IDOR",
    location: "products.ts GET /products",
    title: "Vendor stock aggregate leak",
    detail: "Fixed: Vendor aggregates scoped to own distribution/sales.",
  },
  {
    id: "N6",
    sev: "low",
    area: "Authz",
    location: "accounts.ts + reports.ts",
    title: "No vendor block on ledgers",
    detail: "Fixed: router.use(blockVendors).",
  },
  {
    id: "N7",
    sev: "low",
    area: "IDOR",
    location: "sales validate + by-barcode + invoices",
    title: "Barcode / next-number gaps",
    detail: "Fixed: Vendor JWT scope; next-number denied for Vendor.",
  },
  {
    id: "N8",
    sev: "low",
    area: "Authz",
    location: "admin.ts create user",
    title: "Create skipped vendor existence",
    detail: "Fixed: verify vendor exists in-tenant.",
  },
];

const DEFERRED: Finding[] = [
  {
    id: "D1",
    sev: "medium",
    area: "RLS",
    location: "pg-db.ts",
    title: "FORCE RLS not enabled",
    detail: "Deferred: needs withTenantClient cutover.",
  },
  {
    id: "D2",
    sev: "medium",
    area: "Electron",
    location: "license-store",
    title: "Weak on-prem license key",
    detail: "Deferred: product/crypto decision.",
  },
  {
    id: "D3",
    sev: "low",
    area: "Session",
    location: "session.ts",
    title: "Tokens in localStorage",
    detail: "Deferred: httpOnly cookie architecture.",
  },
];

export default function SplenderCodeReviewClosed() {
  const theme = useHostTheme();
  const [filter, setFilter] = useCanvasState<"closed" | Sev | "deferred">(
    "filter",
    "closed"
  );

  const shown =
    filter === "deferred"
      ? DEFERRED
      : filter === "closed"
        ? CLOSED
        : CLOSED.filter((f) => f.sev === filter);

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <H1>Dhandho — code review</H1>
        <Text tone="secondary" size="small">
          N1–N8 fixed · 0 open · {DEFERRED.length} deferred · 0 critical
        </Text>
      </Stack>

      <Callout tone="success" title="Verdict">
        All open findings from the post–R1–R11 pass are fixed. Deferred D1–D3
        remain intentional backlog.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="0" label="Open" tone="success" />
        <Stat value={String(CLOSED.length)} label="Closed (N1–N8)" />
        <Stat value={String(DEFERRED.length)} label="Deferred" tone="info" />
        <Stat value="0" label="Critical" />
      </Grid>

      <Divider />

      <Stack gap={12}>
        <Row gap={8} align="center" style={{ flexWrap: "wrap" }}>
          <H2>Findings</H2>
          <Spacer />
          <Pill active={filter === "closed"} onClick={() => setFilter("closed")}>
            Closed ({CLOSED.length})
          </Pill>
          <Pill
            active={filter === "deferred"}
            onClick={() => setFilter("deferred")}
          >
            Deferred ({DEFERRED.length})
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
        />
      </Stack>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Source: docs/FULL_CODE_REVIEW.md · e2e target 493/493
      </Text>
    </Stack>
  );
}
