import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const REQUIRED_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
];

export default defineConfig(({ command, mode }) => {
  // A production build without Firebase config deploys a blank page — fail loudly instead.
  if (command === 'build') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const missing = REQUIRED_ENV.filter(key => !env[key]);
    if (missing.length) throw new Error(`Missing env for build: ${missing.join(', ')}`);
    if (!env.VITE_MAPY_KEY) console.warn('VITE_MAPY_KEY not set — the Tourist map style will be hidden.');
  }

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // The Firestore SDK alone is ~690 kB minified; it is cached separately via manualChunks.
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          // Split vendors so an app-only change does not bust the cached Firebase/Leaflet bundles.
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            map: ['leaflet', 'react-leaflet'],
            react: ['react', 'react-dom', 'framer-motion'],
          },
        },
      },
    },
  };
});
