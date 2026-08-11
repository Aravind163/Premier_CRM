import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// We read a custom VITE_DEPLOY_TARGET env var (set in Vercel's dashboard
// under Settings -> Environment Variables) instead of Vercel's built-in
// VERCEL variable, since that one isn't exposed to builds by default.
// Locally / on XAMPP this will be undefined, so nothing changes for you there.
const isVercel = process.env.VITE_DEPLOY_TARGET === 'vercel';

export default defineConfig({
  base: isVercel ? '/' : '/Premier_crm/public/',
  build: {
    chunkSizeWarningLimit: 2400,
    outDir: isVercel ? 'dist' : '../public',
    assetsDir: 'assets',
    emptyOutDir: isVercel ? true : false,
  },
  plugins: [
    react({
    }),
  ],
});