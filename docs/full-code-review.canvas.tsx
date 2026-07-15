import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  Divider,
  Grid,
  H1,
  H2,
  Stack,
  Stat,
  Table,
  Text,
  useHostTheme,
} from "cursor/canvas";

const CLOSED = [
  { id: "H1", title: "Dist bill / einvoice / ewaybill vendor-scoped" },
  { id: "H2", title: "PATH_MODULE covers banks/staff/suppliers/chatbot/…" },
  { id: "H3", title: "Analytics + rewards-summary vendor-scoped" },
  { id: "H4", title: "Invoice-finance GETs blockVendors" },
  { id: "M1", title: "Unlinked Vendor 403 on distribution list" },
  { id: "M2", title: "Vendor payment FOR UPDATE allocation" },
  { id: "L1", title: "Chatbot generic 500 + blockVendors" },
  { id: "L2", title: "masters/categories gated via PATH_MODULE" },
  { id: "L3", title: "SuperAdminBilling print esc" },
];

const DEFERRED = [
  { id: "—", title: "FORCE RLS (withTenantClient cutover)" },
  { id: "—", title: "Weak on-prem license key crypto" },
  { id: "—", title: "Tokens in localStorage → httpOnly cookies" },
];

export default function SplenderCodeReviewV9() {
  const theme = useHostTheme();

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1100 }}>
      <Stack gap={8}>
        <H1>Dhandho — full code review (v9)</H1>
        <Text tone="secondary" size="small">
          Post-fix · v8 findings closed · e2e_by_type 493/493 · deferred
          excluded
        </Text>
      </Stack>

      <Callout tone="success" title="v8 open set — all fixed">
        9 findings closed. No critical/high/medium/low remain from that pass.
      </Callout>

      <Grid columns={4} gap={12}>
        <Stat value="0" label="Critical" />
        <Stat value="0" label="High" />
        <Stat value="0" label="Medium" />
        <Stat value="0" label="Low" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Card>
          <CardHeader>Closed this pass</CardHeader>
          <CardBody>
            <Table
              headers={["ID", "Fix"]}
              rows={CLOSED.map((c) => [c.id, c.title])}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Still deferred</CardHeader>
          <CardBody>
            <Table
              headers={["", "Item"]}
              rows={DEFERRED.map((d) => [d.id, d.title])}
            />
          </CardBody>
        </Card>
      </Grid>

      <Divider />
      <H2>Verification</H2>
      <Text size="small">
        Each v8 finding verified on disk, then fixed. API restarted;
        e2e_by_type → 493/493.
      </Text>
      <Text size="small" style={{ color: theme.text.secondary }}>
        docs/FULL_CODE_REVIEW.md · deferred FORCE RLS / license / localStorage
        not listed as open.
      </Text>
    </Stack>
  );
}
