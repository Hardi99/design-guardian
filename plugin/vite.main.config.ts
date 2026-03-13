import { defineConfig } from 'vite';

// Main thread build — plain IIFE bundle, no DOM, Figma API only
export default defineConfig({
  build: {
    lib: {
      entry: 'src/main.ts',
      formats: ['iife'],
      name: 'FigmaMain',
      fileName: () => 'main.js',
    },
    target: 'es2017',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
