import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
base: '/Premier_crm/public/',
build: {
    chunkSizeWarningLimit: 1000,
    outDir: '../public',
    assetsDir: 'assets',
    emptyOutDir: false,
},
  plugins: [
    react({
      babel: {
        plugins: ['babel-plugin-react-compiler'],
      },
    }),
  ],
})