import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type PluginOption } from 'vite';

export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '');
  const analyze = mode === 'analyze';
  const serviceMobile = mode === 'service-mobile';
  /** Online Cap shell — relative base like Offline; must NOT set VITE_DEPLOYMENT_MODE=service-mobile */
  const serviceCloud = mode === 'service-cloud';
  /** Unified Cap shell — Online/Offline chosen once at first launch */
  const servicePhone = mode === 'service-phone';
  const capacitorShell = serviceMobile || serviceCloud || servicePhone;
  const plugins: PluginOption[] = [react(), tailwindcss()];
  // Optional — keep as a dynamic import so production installs without
  // rollup-plugin-visualizer (devDependency) still build.
  if (analyze) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { visualizer } = require('rollup-plugin-visualizer') as typeof import('rollup-plugin-visualizer');
    plugins.push(visualizer({ filename: 'dist/stats.html', gzipSize: true, open: false }));
  }
  return {
    base: capacitorShell ? './' : '/',
    plugins,
    // PGlite ships its own WASM/data URLs — Vite prebundle breaks them (blank DB / WASM compile errors).
    optimizeDeps: {
      exclude: ['@electric-sql/pglite'],
    },
    worker: {
      format: 'es',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: servicePhone
        ? 'dist-service-phone'
        : serviceMobile
          ? 'dist-service-mobile'
          : serviceCloud
            ? 'dist-service-cloud'
            : 'dist',
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
      // Cap/Android build outputs are not part of the Vite app graph (they break dep scan / crash HMR).
      fs: {
        deny: [
          '**/android/**',
          '**/ios/**',
          '**/dist-apk/**',
          '**/dist-service-mobile/**',
          '**/dist-service-cloud/**',
          '**/dist-service-phone/**',
        ],
      },
      watch: {
        ignored: [
          '**/android/**',
          '**/ios/**',
          '**/dist-apk/**',
          '**/dist-service-mobile/**',
          '**/dist-service-cloud/**',
          '**/dist-service-phone/**',
          '**/node_modules/**',
        ],
      },
      proxy: {
        // Cap phone Vite: proxy license/cloud APIs (avoids CORS on localhost:*).
        // Other modes: local Express. Override: DG_DEV_API_PROXY=https://…
        '/api': {
          target:
            process.env.DG_DEV_API_PROXY ||
            (serviceMobile || servicePhone ? 'https://dhandho.onrender.com' : 'http://localhost:3001'),
          changeOrigin: true,
          secure: true,
        },
        '/manifest.json': {
          target:
            process.env.DG_DEV_API_PROXY ||
            (serviceMobile || servicePhone ? 'https://dhandho.onrender.com' : 'http://localhost:3001'),
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
