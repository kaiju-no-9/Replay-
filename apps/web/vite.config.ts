import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const RUNTIME_URL = process.env.RELAY_RUNTIME_URL || 'http://127.0.0.1:4400';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    host: 'localhost',
    proxy: {
      '/api': {
        target: RUNTIME_URL,
        changeOrigin: true,
      },
      '/ws': {
        target: RUNTIME_URL.replace('http', 'ws'),
        ws: true,
      },
    },
  },
});
