/**
 * Fixed on-device folder tree for Offline / Cap phone saves (no path picker).
 * Android + iOS: Directory.Documents → user-visible Documents/Dhandho/{subdir}/
 * (Android public Documents; iOS app Documents, exposed via Files with Info.plist keys).
 */

export type DhandhoSubdir = 'backups' | 'invoices' | 'bug-reports';

export type SaveDhandhoFileResult = {
  /** Path relative to the Filesystem directory root, e.g. Dhandho/backups/foo.json */
  path: string;
  /** Display path for toasts — Documents/Dhandho/... so users know where to look */
  relativePath: string;
  uri: string;
  filename: string;
};

export function sanitizeDhandhoFilename(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{M}\p{N}.\- ()#]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
    .trim();
  return cleaned.slice(0, 120) || 'file';
}

export function dhandhoRelativePath(subdir: DhandhoSubdir, filename: string): string {
  return `Dhandho/${subdir}/${sanitizeDhandhoFilename(filename)}`;
}

/** User-facing path shown in toasts / mailto (matches My Files → Documents → Dhandho). */
export function dhandhoDisplayPath(subdir: DhandhoSubdir, filename: string): string {
  return `Documents/${dhandhoRelativePath(subdir, filename)}`;
}

export function isNativeCapacitor(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** True when Filesystem.stat result proves a non-empty file exists. */
export function isConfirmedDhandhoWrite(stat: { type?: string; size?: number } | null | undefined): boolean {
  if (!stat) return false;
  if (stat.type && stat.type !== 'file') return false;
  if (typeof stat.size === 'number' && stat.size <= 0) return false;
  return true;
}

async function resolveDirectory(): Promise<import('@capacitor/filesystem').Directory> {
  const { Directory } = await import('@capacitor/filesystem');
  return Directory.Documents;
}

async function ensurePublicStorageAccess(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.getPlatform() !== 'android') return;

  const { Filesystem } = await import('@capacitor/filesystem');
  const current = await Filesystem.checkPermissions();
  if (current.publicStorage === 'granted') return;

  const requested = await Filesystem.requestPermissions();
  if (requested.publicStorage !== 'granted') {
    throw new Error('Storage permission is required to save under Documents/Dhandho');
  }
}

/**
 * Write a file under Dhandho/{subdir}/. Creates parent folders as needed.
 * `data` is UTF-8 text when encoding is 'utf8', or raw base64 when encoding is 'base64'.
 * Only resolves after Filesystem.stat confirms a non-empty file.
 */
export async function saveDhandhoFile(opts: {
  subdir: DhandhoSubdir;
  filename: string;
  data: string;
  encoding?: 'utf8' | 'base64';
}): Promise<SaveDhandhoFileResult> {
  if (!isNativeCapacitor()) {
    throw new Error('saveDhandhoFile is only available on the native Cap app');
  }

  const filename = sanitizeDhandhoFilename(opts.filename);
  const path = dhandhoRelativePath(opts.subdir, filename);
  const encoding = opts.encoding ?? 'utf8';

  const { Filesystem, Encoding } = await import('@capacitor/filesystem');
  const directory = await resolveDirectory();

  await ensurePublicStorageAccess();

  await Filesystem.mkdir({
    path: `Dhandho/${opts.subdir}`,
    directory,
    recursive: true,
  }).catch((err: unknown) => {
    const msg = String((err as { message?: string })?.message ?? err).toLowerCase();
    if (msg.includes('exist') || msg.includes('already')) return;
    throw err instanceof Error ? err : new Error(String(err));
  });

  const writeOpts =
    encoding === 'utf8'
      ? { path, data: opts.data, directory, encoding: Encoding.UTF8 }
      : { path, data: opts.data, directory };

  const written = await Filesystem.writeFile(writeOpts);
  const uri = written.uri || (await Filesystem.getUri({ path, directory })).uri;

  const stat = await Filesystem.stat({ path, directory });
  if (!isConfirmedDhandhoWrite(stat)) {
    throw new Error(`File was not written at Documents/${path}`);
  }

  return { path, relativePath: dhandhoDisplayPath(opts.subdir, filename), uri, filename };
}
