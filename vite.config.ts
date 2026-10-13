import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [tailwindcss(), react()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 1000, // Aumentado pra 1000kB (document libs são pesadas)
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Document generation libs — carregadas via dynamic import
            // Separar em chunks próprios pra não ir pro bundle principal
            if (id.includes('node_modules/exceljs/')) {
              return 'exceljs';
            }
            if (id.includes('node_modules/jspdf') || id.includes('node_modules/canvg') || id.includes('node_modules/raf')) {
              return 'jspdf';
            }
            if (id.includes('node_modules/pptxgenjs/')) {
              return 'pptxgenjs';
            }
            // React core
            if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react/')) {
              return 'vendor-lucide';
            }
            // Markdown rendering
            if (
              id.includes('node_modules/react-markdown/') ||
              id.includes('node_modules/remark-') ||
              id.includes('node_modules/mdast-') ||
              id.includes('node_modules/hast-') ||
              id.includes('node_modules/vfile') ||
              id.includes('node_modules/unist-') ||
              id.includes('node_modules/micromark') ||
              id.includes('node_modules/unified')
            ) {
              return 'vendor-markdown';
            }
            if (id.includes('node_modules/motion/')) {
              return 'vendor-motion';
            }
          },
        },
      },
    },
  };
});
