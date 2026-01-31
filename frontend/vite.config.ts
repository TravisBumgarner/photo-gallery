import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8084',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://localhost:8084',
        changeOrigin: true,
      },
      '/thumbnails': {
        target: 'http://localhost:8084',
        changeOrigin: true,
      },
    },
  },
});
