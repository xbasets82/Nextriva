import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { resolveApiProxyTarget } from './src/lib/api-proxy.js';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: resolveApiProxyTarget(),
        changeOrigin: false,
      },
    },
  },
});
