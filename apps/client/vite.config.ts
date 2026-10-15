import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const pkgs = ['domain', 'calculators', 'sessions', 'journal', 'storage', 'i18n', 'ui', 'data-contracts'];
const alias = Object.fromEntries(pkgs.map((p) => [`@tc/${p}`, fileURLToPath(new URL(`../../packages/${p}/src/index.${p === 'ui' ? 'tsx' : 'ts'}`, import.meta.url))]));
const version = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version as string;

// Native (Capacitor) builds ship all assets inside the app; the service worker is web-only.
const native = process.env.TC_TARGET === 'native';

export default defineConfig({
  base: './',
  resolve: { alias, dedupe: ['react', 'react-dom'] },
  define: { __APP_VERSION__: JSON.stringify(version), __NATIVE__: JSON.stringify(native) },
  plugins: [
    react(),
    VitePWA({
      disable: native,
      registerType: 'prompt', // never reload under the user's feet; they choose when to update
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Amix — Trading Companion',
        short_name: 'Amix',
        description: 'Position sizing, sessions, journal and performance review. Local-first, no signup.',
        theme_color: '#0e3b43',
        background_color: '#0b1416',
        display: 'standalone',
        start_url: './',
        scope: './',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mq4,mq5}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // No runtime caching of third-party data: the app works from local storage only.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
  preview: { port: 4173 },
});
