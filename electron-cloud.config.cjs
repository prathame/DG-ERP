/**
 * @deprecated Use electron-desktop.config.cjs (unified Online/Offline).
 * package.json scripts redirect to the unified desktop build.
 */
module.exports = {
  appId: 'in.dhandho.cloud',
  productName: 'Dhandho',  // Cloud wrapper — opens dhandho.app
  directories: { output: 'dist-electron/cloud' },
  files: [
    'electron/cloud/**',
    'node_modules/electron/**',
  ],
  extraMetadata: {
    main: 'electron/cloud/main.js',
    type: 'commonjs',
  },
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
    installerHeaderIcon: 'public/icons/icon.ico',
  },
  publish: [{ provider: 'github', owner: 'prathame', repo: 'DG-ERP' }],
};
