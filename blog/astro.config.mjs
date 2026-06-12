import { defineConfig } from 'astro/config';

export default defineConfig({
  server: {
    headers: {
      'Content-Type': 'text/html; charset=UTF-8',
    },
  },
  base: '/blog/',
  root: './',
  srcDir: 'src',
  publicDir: 'public',
  outDir: 'dist',
  site: 'https://tekeep.com/blog/',
  build: {
    format: 'directory',
  },
});
