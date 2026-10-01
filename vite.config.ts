import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

function buildId(): string {
  const fromHost = process.env.COMMIT_REF?.slice(0, 7); // Netlify
  if (fromHost) return fromHost;
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildId()) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'דריקס OS',
        short_name: 'דריקס',
        description: 'ניהול משמרות, נהלים, משחקים וטיפים - דריקס חיפה',
        lang: 'he',
        dir: 'rtl',
        theme_color: '#151517',
        background_color: '#151517',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
