/**
 * @deprecated Use electron-desktop.config.cjs (unified Online/Offline).
 * package.json scripts redirect to the unified desktop build.
 */
module.exports = {
  appId: 'in.dhandho.onprem',
  productName: 'Dhandho On-Prem',
  directories: { output: 'dist-electron/onprem' },
  files: [
    'dist/**',           // Built React frontend
    'server/**',         // Express backend
    'shared/**',         // server imports tabPresets / mobileFeatures / etc.
    'electron/onprem/**', // On-prem main process
    'electron/shared/**', // Shared constants
    'node_modules/**',
    '!node_modules/.cache/**',
    '!node_modules/electron/dist/**',
  ],
  extraMetadata: {
    main: 'electron/onprem/main.js',
    type: 'commonjs',
  },
  // PostgreSQL binaries bundled via embedded-postgres
  asarUnpack: [
    'node_modules/embedded-postgres/**',
    'node_modules/@embedded-postgres/**',
  ],
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
