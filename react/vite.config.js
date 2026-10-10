import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// In local dev, forward /api to the Hono API (`npm run dev:api` at the repo root)
// so the app calls /api the same way it does on Vercel.
const apiProxy = { '/api': 'http://localhost:8787' };

export default defineConfig({
  plugins: [react()],
  server: { strictPort: true, proxy: apiProxy },
  preview: { strictPort: true, proxy: apiProxy },
});
