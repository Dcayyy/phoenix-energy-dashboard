import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // three.js is most of the bundle; a single-page showcase doesn't need it split.
  build: { chunkSizeWarningLimit: 1100 },
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
  preview: { host: '127.0.0.1', port: 5191 },
});
