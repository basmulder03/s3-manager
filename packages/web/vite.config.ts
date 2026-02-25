import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@web': resolve(__dirname, './src'),
      '@': resolve(__dirname, './src'),
      '@server': resolve(__dirname, '../server/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
});
