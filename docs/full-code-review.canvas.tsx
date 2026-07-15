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

/** Post R1–R11 re-review — verified on disk @ b1a42c0 + dirty fixes. */
const OPEN: Finding[] = [
  {
    id: "N1",
    sev: "high",
    area: "Money",
    location: "purchases.ts POST /supplier-finance/:id/payments",
    title: "Supplier payments uncapped / unlocked",
    detail:
      "Inserts any positive amount with no FOR UPDATE and no remaining-balance check. Vendor/invoice/bank-statement paths already lock+cap.",
  },
  {
    id: "N2",
    sev: "medium",
    area: "Money",
    location: "finance.ts POST …/payments (no batchId)",
    title: "Vendor all-batch path allows advances",
    detail:
      "After allocating to dues, leftover is inserted as Advance payment. Batch-scoped + bank-statement paths cap; free-form path does not. May be intentional policy.",
  },
  {
    id: "N3",
    sev: "medium",
    area: "Errors",
    location: "distribution.ts PUT /batch/:batchId",
    title: "Catch returns err.message",
    detail:
      "Any Error (including Postgres constraint failures) is returned as 400 with raw message — schema/constraint leakage.",
  },
  {
    id: "N4",
    sev: "medium",
    area: "XSS",
    location: "billTemplates.ts invoice/challan",
    title: "Prefixes / packQuantity not fully escaped",
    detail:
      "Body still uses raw invPrefix+bill.id and chPrefix+challanId; challan <title> unescaped; packQuantity embeds packName without esc().",
  },
  {
    id: "N5",
    sev: "medium",
    area: "IDOR",
    location: "products.ts GET /products",
    title: "Vendor list leaks tenant-wide stock aggregates",
    detail:
      "Product rows filtered to distributed products, but JOIN subqueries still return tenant-wide inv_stock / sold_count / with_vendors. Needs inventory:view (hidden by default).",
  },
  {
    id: "N6",
    sev: "low",
    area: "Authz",
    location: "accounts.ts + reports.ts GETs",
    title: "No vendor scoping on ledgers/registers",
    detail:
      "No assertVendorLinked / vendorScopeId. Default Vendor has accounts:hidden; custom Vendor+accounts:view sees full-tenant P&L/registers.",
  },
  {
    id: "N7",
    sev: "low",
    area: "IDOR",
    location: "sales validate + products/by-barcode",
    title: "Barcode endpoints lack Vendor JWT scope",
    detail:
      "validate uses optional ?vendorId= only; by-barcode has no Vendor checks. Default modules hide these; custom perms widen the hole.",
  },
  {
    id: "N8",
    sev: "low",
    area: "Authz",
    location: "admin.ts POST /admin/users",
    title: "Create Vendor skips vendor existence check",
    detail:
      "Requires vendorId for Vendor role but does not verify the vendor exists in-tenant (update path does).",
  },
];

const DEFERRED: Finding[] = [
  {
    id: "D1",
    sev: "medium",
    area: "RLS",
    location: "pg-db.ts",
    title: "FORCE RLS not enabled",
    detail: "ENABLE without FORCE; pool owner bypasses. Needs withTenantClient cutover.",
  },
  {
    id: "D2",
    sev: "medium",
    area: "Electron",
    location: "license-store",
    title: "Weak on-prem license key",
    detail: "AES key derived from hostname/user — product/crypto decision.",
  },
  {
    id: "D3",
    sev: "low",
    area: "Session",
    location: "session.ts",
    title: "Tokens in localStorage",
    detail: "XSS → session theft. Needs httpOnly cookie architecture.",
  },
];

const CLOSED_PRIOR = [
  "R1–R11 (unlinked Vendor, batch pay caps, admin Vendor link, apply-billing/replacements locks, err.message bulk, print title/warranty esc)",
  "PATH_MODULE · assertVendorLinked/Access · live role refresh · deleted-user JWT",
  "Invoice payment FOR UPDATE · openExternal http(s) · backup requireAdmin",
];

export default function SplenderCodeReviewV12() {
  const theme = useHostTheme();
  const [filter, setFilter] = useCanvasState<"all" | Sev | "deferred">(
    "filter",
    "all"
  );

  const counts = {
    critical: OPEN.filter((f) => f.sev === "critical").length,
    high: OPEN.filter((f) => f.sev === "high").length,
    medium: OPEN.filter((f) => f.sev === "medium").length,
    low: OPEN.filter((f) => f.sev === "low").length,
  };

  const shown =
    filter === "deferred"
      ? DEFERRED
      : filter === "all"
        ? OPEN
        : OPEN.filter((f) => f.sev === filter);

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <H1>Dhandho — code review (post R1–R11)</H1>
        <Text tone="secondary" size="small">
          Fresh pass · main @ b1a42c0 (+ dirty fixes) · {OPEN.length} open ·{" "}
          {DEFERRED.length} deferred · 0 critical
        </Text>
      </Stack>

      <Callout tone="warning" title="Verdict">
        Prior sprint items hold. Remaining risk is mostly money integrity
        (supplier payments) and print/authz defense-in-depth. No critical
        auth bypass or SQLi found.
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
              <Text size="small">1. N1 — supplier payment lock + balance cap</Text>
              <Text size="small">2. N2 — decide: forbid or document vendor advances</Text>
              <Text size="small">3. N3 + N4 — batch error leak + print esc leftovers</Text>
              <Text size="small">4. N5 — scope product aggregates for Vendors</Text>
              <Text size="small">5. N6–N8 — accounts scope / barcode / admin create</Text>
            </Stack>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Still solid</CardHeader>
          <CardBody>
            <Text size="small">
              {CLOSED_PRIOR.map((s) => `• ${s}`).join("\n")}
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
            Open ({OPEN.length})
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
          rowTone={shown.map((f) =>
            f.sev === "critical"
              ? "danger"
              : f.sev === "high"
                ? "warning"
                : undefined
          )}
        />
      </Stack>

      <Callout tone="neutral" title="Policy note">
        N2 (vendor advances) and historically supplier advances may be
        intentional. Confirm product intent before capping N1/N2 the same way
        as invoice payments.
      </Callout>

      <Text size="small" style={{ color: theme.text.secondary }}>
        Verified on disk · e2e last green 493/493 · docs/FULL_CODE_REVIEW.md
      </Text>
    </Stack>
  );
}
