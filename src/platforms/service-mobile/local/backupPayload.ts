/** True when plaintext is the JSON table dump (fallback path), not a PGlite dumpDataDir tar. */
export function isJsonTablesDump(bytes: Uint8Array): boolean {
  if (!bytes.length) return false;
  // Cheap reject for gzip before full decode
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return false;
  let text: string;
  try {
    text = new TextDecoder().decode(bytes);
  } catch {
    return false;
  }
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as { tables?: unknown };
    return Boolean(parsed && typeof parsed === 'object' && parsed.tables && typeof parsed.tables === 'object');
  } catch {
    return false;
  }
}
