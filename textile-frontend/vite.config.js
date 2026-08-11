import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vercel automatically sets process.env.VERCEL = '1' during its build.
// Locally / on XAMPP this will be undefined, so nothing changes for you there.
const isVercel = process.env.VERCEL === '1';

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
      // babel: {
      //   plugins: ['babel-plugin-react-compiler'],
      // },
    }),
  ],
});