import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dhandhoDisplayPath,
  dhandhoRelativePath,
  isConfirmedDhandhoWrite,
  sanitizeDhandhoFilename,
} from '../../src/lib/dhandhoFiles';

const writeFileMock = vi.fn();
const getUriMock = vi.fn();
const mkdirMock = vi.fn();
const statMock = vi.fn();
const checkPermissionsMock = vi.fn();
const requestPermissionsMock = vi.fn();
const getPlatformMock = vi.fn(() => 'android');

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: (...args: unknown[]) => writeFileMock(...args),
    getUri: (...args: unknown[]) => getUriMock(...args),
    mkdir: (...args: unknown[]) => mkdirMock(...args),
    stat: (...args: unknown[]) => statMock(...args),
    checkPermissions: (...args: unknown[]) => checkPermissionsMock(...args),
    requestPermissions: (...args: unknown[]) => requestPermissionsMock(...args),
  },
  Directory: { Documents: 'DOCUMENTS', External: 'EXTERNAL', Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => getPlatformMock(),
    isNativePlatform: () => true,
  },
}));

describe('dhandhoFiles path helpers', () => {
  it('sanitizes unsafe filename characters', () => {
    expect(sanitizeDhandhoFilename('inv/../a:b*.pdf')).toBe('inv_.._a_b_.pdf');
    expect(sanitizeDhandhoFilename('  ok-name (1).json  ')).toBe('ok-name (1).json');
    expect(sanitizeDhandhoFilename('$$$')).toBe('file');
    expect(sanitizeDhandhoFilename('प्रविण.pdf')).toBe('प्रविण.pdf');
  });

  it('builds Dhandho/{subdir}/{filename} paths', () => {
    expect(dhandhoRelativePath('backups', 'offline-mobile-backup-x.json')).toBe(
      'Dhandho/backups/offline-mobile-backup-x.json',
    );
    expect(dhandhoRelativePath('invoices', 'Quote #12.pdf')).toBe('Dhandho/invoices/Quote #12.pdf');
    expect(dhandhoRelativePath('bug-reports', 'dhandho-bug-report-2026-07-20.txt')).toBe(
      'Dhandho/bug-reports/dhandho-bug-report-2026-07-20.txt',
    );
  });

  it('sanitizes when building relative path', () => {
    expect(dhandhoRelativePath('invoices', 'bad/name?.pdf')).toBe('Dhandho/invoices/bad_name_.pdf');
  });

  it('builds Documents/Dhandho display paths for toasts', () => {
    expect(dhandhoDisplayPath('backups', 'offline-mobile-backup-x.json')).toBe(
      'Documents/Dhandho/backups/offline-mobile-backup-x.json',
    );
  });

  it('confirms write only for non-empty files', () => {
    expect(isConfirmedDhandhoWrite({ type: 'file', size: 120 })).toBe(true);
    expect(isConfirmedDhandhoWrite({ size: 1 })).toBe(true);
    expect(isConfirmedDhandhoWrite({ type: 'file', size: 0 })).toBe(false);
    expect(isConfirmedDhandhoWrite({ type: 'directory', size: 10 })).toBe(false);
    expect(isConfirmedDhandhoWrite(null)).toBe(false);
  });
});

describe('saveDhandhoFile write confirmation', () => {
  beforeEach(() => {
    vi.resetModules();
    writeFileMock.mockReset();
    getUriMock.mockReset();
    mkdirMock.mockReset();
    statMock.mockReset();
    checkPermissionsMock.mockReset();
    requestPermissionsMock.mockReset();
    getPlatformMock.mockReturnValue('android');

    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true },
    });

    mkdirMock.mockResolvedValue(undefined);
    checkPermissionsMock.mockResolvedValue({ publicStorage: 'granted' });
    writeFileMock.mockResolvedValue({ uri: 'file:///Documents/Dhandho/backups/b.json' });
    getUriMock.mockResolvedValue({ uri: 'file:///Documents/Dhandho/backups/b.json' });
    statMock.mockResolvedValue({ type: 'file', size: 42 });
  });

  it('writes to Documents, confirms with stat, returns display path', async () => {
    const { saveDhandhoFile } = await import('../../src/lib/dhandhoFiles');
    const saved = await saveDhandhoFile({
      subdir: 'backups',
      filename: 'b.json',
      data: '{"ok":true}',
      encoding: 'utf8',
    });

    expect(writeFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'Dhandho/backups/b.json',
        directory: 'DOCUMENTS',
        encoding: 'utf8',
      }),
    );
    expect(statMock).toHaveBeenCalledWith({ path: 'Dhandho/backups/b.json', directory: 'DOCUMENTS' });
    expect(saved.relativePath).toBe('Documents/Dhandho/backups/b.json');
  });

  it('requests Android storage permission when not granted', async () => {
    checkPermissionsMock.mockResolvedValue({ publicStorage: 'prompt' });
    requestPermissionsMock.mockResolvedValue({ publicStorage: 'granted' });

    const { saveDhandhoFile } = await import('../../src/lib/dhandhoFiles');
    await saveDhandhoFile({
      subdir: 'backups',
      filename: 'b.json',
      data: '{}',
      encoding: 'utf8',
    });

    expect(requestPermissionsMock).toHaveBeenCalled();
  });

  it('throws before toast-worthy success when permission denied', async () => {
    checkPermissionsMock.mockResolvedValue({ publicStorage: 'denied' });
    requestPermissionsMock.mockResolvedValue({ publicStorage: 'denied' });

    const { saveDhandhoFile } = await import('../../src/lib/dhandhoFiles');
    await expect(
      saveDhandhoFile({
        subdir: 'backups',
        filename: 'b.json',
        data: '{}',
        encoding: 'utf8',
      }),
    ).rejects.toThrow(/Storage permission/);
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it('throws when writeFile resolves but stat shows empty/missing file', async () => {
    statMock.mockResolvedValue({ type: 'file', size: 0 });

    const { saveDhandhoFile } = await import('../../src/lib/dhandhoFiles');
    await expect(
      saveDhandhoFile({
        subdir: 'backups',
        filename: 'b.json',
        data: '{}',
        encoding: 'utf8',
      }),
    ).rejects.toThrow(/not written/);
  });
});
