import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    // Remove console.log/info/debug do bundle de produção (minificado), mantendo
    // console.error/warn para monitoramento. Em dev não há minificação, então os
    // logs continuam visíveis.
    esbuild: {
      pure: ['console.log', 'console.info', 'console.debug'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      // Raise warning threshold slightly; vendor splitting handles the main chunk
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        // tesseract.js is an optional OCR dependency.  It is NOT installed by
        // default — users who need scanned-PDF support can add it manually:
        //   npm install tesseract.js
        // Marking it external prevents Rollup from erroring on the dynamic
        // import; the try/catch in ocrFallback.ts handles runtime absence.
        external: ["tesseract.js"],
        output: {
          manualChunks: {
            // Vendor: React runtime — stable, infrequently changes
            'vendor-react': ['react', 'react-dom'],
            // Vendor: Supabase client (largest single dependency)
            'vendor-supabase': ['@supabase/supabase-js'],
            // Vendor: Lucide icon library
            'vendor-icons': ['lucide-react'],
            // Vendor: planilhas (xlsx) — pesado, separado p/ cache e carga paralela
            'vendor-xlsx': ['xlsx'],
          },
        },
      },
    },
  };
});
