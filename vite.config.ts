import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { checkLeadTarget } from './lib/lead-target-config.js';

export default defineConfig(({ mode }) => {
    // WS hub switch guard: the form's Supabase URL and schema are Core + itp_hub together or neither, else no build.
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    checkLeadTarget(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_DB_SCHEMA);
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
          'react': 'preact/compat',
          'react-dom': 'preact/compat',
          'react-dom/client': 'preact/compat',
          'react/jsx-runtime': 'preact/jsx-runtime',
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-preact': ['preact'],
              'vendor-recharts': ['recharts'],
              'vendor-supabase': ['@supabase/supabase-js'],
            }
          }
        }
      }
    };
});
