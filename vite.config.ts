import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isMobile = mode === 'mobile' || env.VITE_MOBILE === '1';
  const analyze = mode === 'analyze';
  const plugins: PluginOption[] = [react(), tailwindcss()];
  // Optional — keep as a dynamic import so production installs without
  // rollup-plugin-visualizer (devDependency) still build.
  if (analyze) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visualizer } = require('rollup-plugin-visualizer') as typeof import('rollup-plugin-visualizer');
    plugins.push(visualizer({ filename: 'dist/stats.html', gzipSize: true, open: false }));
  }
  return {
    // Relative assets required for Capacitor file:// / capacitor:// WebView
    base: isMobile ? './' : '/',
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: isMobile ? 'dist-mobile' : 'dist',
      emptyOutDir: true,
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // React core — tiny, always needed
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            // Framer Motion — large, only needed for animated pages
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // Scanner / barcode — only on inventory pages
            if (id.includes('html5-qrcode') || id.includes('jsbarcode')) {
              return 'vendor-scanner';
            }
            // xlsx — only on bank statement upload
            if (id.includes('xlsx')) {
              return 'vendor-xlsx';
            }
            // lucide icons — icon library
            if (id.includes('node_modules/lucide-react') || id.includes('node_modules/@lucide')) {
              return 'vendor-icons';
            }
          },
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      proxy: {
        // Default: local Express. Override for cloud: DG_DEV_API_PROXY=https://dg-erp.onrender.com
        '/api': {
          target: process.env.DG_DEV_API_PROXY || 'http://localhost:3001',
          changeOrigin: true,
          secure: true,
        },
        '/manifest.json': {
          target: process.env.DG_DEV_API_PROXY || 'http://localhost:3001',
          changeOrigin: true,
          secure: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
