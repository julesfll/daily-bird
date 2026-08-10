import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project pages are served from https://<user>.github.io/daily-bird/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/daily-bird/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
