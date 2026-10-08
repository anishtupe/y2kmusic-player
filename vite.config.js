import { defineConfig } from 'vite';

// base: './' makes the build work from any sub-path,
// so the same build runs on Vercel, Netlify and GitHub Pages.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
