/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '1.0.0') },
  base: './',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    {
      // Politique de sécurité stricte en production : aucune connexion vers un serveur tiers.
      name: 'csp',
      apply: 'build',
      transformIndexHtml: (html) => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'" />`),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Private Banker Toolkit',
        short_name: 'PB Toolkit',
        description: 'Simulateurs financiers, fiscaux et patrimoniaux pour la banque privée',
        lang: 'fr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F8FA',
        theme_color: '#F7F8FA',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'], alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
