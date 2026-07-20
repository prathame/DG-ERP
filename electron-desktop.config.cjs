/**
 * Unified Desktop Electron — Online (cloud) or Offline (on-prem) chosen once at first launch.
 * ~180MB installer (includes embedded Postgres for Offline path).
 */
module.exports = {
  appId: 'in.dhandho.desktop',
  productName: 'Dhandho',
  directories: { output: 'dist-electron/desktop' },
  files: [
    'dist/**',
    'server/**',
    'electron/desktop/**',
    'electron/cloud/**',
    'electron/onprem/**',
    'electron/shared/**',
    'node_modules/**',
    '!node_modules/.cache/**',
    '!node_modules/electron/dist/**',
  ],
  extraMetadata: {
    main: 'electron/desktop/main.js',
    type: 'commonjs',
  },
  asarUnpack: [
    'node_modules/embedded-postgres/**',
    'node_modules/@embedded-postgres/**',
  ],
  // Stable evergreen names for /download
  artifactName: 'dhandho-desktop-${os}-${arch}.${ext}',
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'public/icons/icon.ico',
  },
  mac: {
    target: [{ target: 'dmg', arch: ['x64', 'arm64'] }],
    icon: 'public/icons/icon.icns',
    category: 'public.app-category.business',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'public/icons/icon.ico',
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  publish: [{ provider: 'github', owner: 'prathame', repo: 'DG-ERP' }],
};
