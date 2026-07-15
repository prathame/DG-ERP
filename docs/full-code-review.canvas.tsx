import {
  Callout,
  Grid,
  H1,
  Stack,
  Stat,
  Text,
  useHostTheme,
} from "cursor/canvas";

export default function SplenderReviewDocMirror() {
  const theme = useHostTheme();
  return (
    <Stack gap={16} style={{ padding: 24, maxWidth: 720 }}>
      <H1>Review status</H1>
      <Callout tone="success" title="0 open">
        GST High/Medium + cloud retry closed. Deferred D1–D3 only. E2E 523/523.
      </Callout>
      <Grid columns={3} gap={12}>
        <Stat value="0" label="Open" tone="success" />
        <Stat value="3" label="Deferred" tone="info" />
        <Stat value="523" label="E2E pass" tone="success" />
      </Grid>
      <Text size="small" style={{ color: theme.text.secondary }}>
        See docs/FULL_CODE_REVIEW.md
      </Text>
    </Stack>
  );
}
