import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // All API calls go through the Vite dev proxy to the Express server.
      '/api': {
        // Matches PORT in server/.env (see client/.env.example for override notes).
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
