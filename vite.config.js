import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    strictPort: false,
    open: false
  },
  // '/miss-fortunes/' for GitHub Pages (subpath-hosted).
  // If we ever switch to a custom domain or itch.io ZIP, change to './' so
  // assets resolve relative to wherever index.html lives.
  base: '/miss-fortunes/',
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
