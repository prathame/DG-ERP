import {
  Callout,
  Grid,
  H1,
  Stack,
  Stat,
  Text,
  useHostTheme,
} from "cursor/canvas";

export default function SplenderReviewComplete() {
  const theme = useHostTheme();
  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 800 }}>
      <Stack gap={8}>
        <H1>Dhandho — review complete</H1>
        <Text tone="secondary" size="small">
          R1–R11 · N1–N8 · O1–O4 closed · D1–D3 deferred only
        </Text>
      </Stack>
      <Callout tone="success" title="Done">
        No open must-fix or optional hardening items remain from the review
        cycle. Only deferred product decisions (FORCE RLS, license key,
        localStorage tokens).
      </Callout>
      <Grid columns={3} gap={12}>
        <Stat value="0" label="Open" tone="success" />
        <Stat value="3" label="Deferred" tone="info" />
        <Stat value="0" label="Critical" />
      </Grid>
      <Text size="small" style={{ color: theme.text.secondary }}>
        O1–O4: quote/order status locks · dist delete locks · warranty barcode
        locks · invoice GSTIN esc
      </Text>
    </Stack>
  );
}
