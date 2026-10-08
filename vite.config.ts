import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CI supplies the actual repository name. Relative assets also work for local
// previews and any project path before a GitHub remote has been configured.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || './',
  build: {
    rollupOptions: {
      output: { manualChunks: { graph: ['cytoscape'], charts: ['recharts'] } },
    },
  },
});
