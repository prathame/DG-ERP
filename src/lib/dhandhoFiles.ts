/**
 * Fixed on-device folder tree for Offline / Cap phone saves (no path picker).
 * Android: Directory.External · iOS: Directory.Documents
 * Relative paths always look like Dhandho/{subdir}/{filename}.
 */

export type DhandhoSubdir = 'backups' | 'invoices' | 'bug-reports';

export type SaveDhandhoFileResult = {
  /** Path relative to the Filesystem directory root, e.g. Dhandho/backups/foo.json */
  path: string;
  /** Display path for toasts (same as path) */
  relativePath: string;
  uri: string;
  filename: string;
};

export function sanitizeDhandhoFilename(name: string): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N}.\- ()#]+/gu, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.\s]+|[_.\s]+$/g, '')
    .trim();
  return cleaned.slice(0, 120) || 'file';
}

export function dhandhoRelativePath(subdir: DhandhoSubdir, filename: string): string {
  return `Dhandho/${subdir}/${sanitizeDhandhoFilename(filename)}`;
}

export function isNativeCapacitor(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

async function resolveDirectory(): Promise<import('@capacitor/filesystem').Directory> {
  const { Directory } = await import('@capacitor/filesystem');
  const { Capacitor } = await import('@capacitor/core');
  return Capacitor.getPlatform() === 'ios' ? Directory.Documents : Directory.External;
}

/**
 * Write a file under Dhandho/{subdir}/. Creates parent folders as needed.
 * `data` is UTF-8 text when encoding is 'utf8', or raw base64 when encoding is 'base64'.
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

  await Filesystem.mkdir({
    path: `Dhandho/${opts.subdir}`,
    directory,
    recursive: true,
  }).catch(() => {
    /* already exists */
  });

  const writeOpts =
    encoding === 'utf8'
      ? { path, data: opts.data, directory, encoding: Encoding.UTF8 }
      : { path, data: opts.data, directory };

  const written = await Filesystem.writeFile(writeOpts);
  const uri = written.uri || (await Filesystem.getUri({ path, directory })).uri;

  return { path, relativePath: path, uri, filename };
}
