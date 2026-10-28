import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ isSsrBuild }) => {
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
      // Saídas de build ficam fora do watch: rodar `npm run build` com o dev
      // aberto criava e apagava dist-ssr/ e o watcher caía com EBUSY (Windows).
      watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/dist/**', '**/dist-ssr/**'] },
    },
    build: {
      // Raise warning threshold slightly; vendor splitting handles the main chunk
      chunkSizeWarningLimit: 600,
      // O build SSR só gera o HTML da landing; public/ já vai no build normal.
      copyPublicDir: !isSsrBuild,
      rollupOptions: {
        // O tesseract.js (OCR) entra no bundle como chunk sob demanda, carregado
        // só quando um PDF escaneado ou uma foto é importada. Ele estava marcado
        // como externo: o import ficava sem resolver no site publicado e o OCR
        // nunca rodou em produção. Worker, núcleo e idioma vêm de /ocr
        // (tools/ocr-assets.mjs).
        // Build SSR (pré-render da landing, tools/prerender-landing.mjs): as
        // dependências ficam externas, então não há vendor para separar.
        output: isSsrBuild ? {} : {
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
