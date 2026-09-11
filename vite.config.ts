import { defineConfig, loadEnv, type ViteDevServer, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'

interface ApiRequest extends IncomingMessage {
  query?: Record<string, string>;
  body?: unknown;
}

interface ApiResponse extends ServerResponse {
  status?: (statusCode: number) => ApiResponse;
  json?: (data: unknown) => ApiResponse;
}

function apiMiddleware(): Plugin {
  return {
    name: 'api-middleware',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/')) return next();

        const urlObj = new URL(req.url, 'http://localhost');
        const apiName = urlObj.pathname.replace(/^\/api\//, '');
        const apiFile = path.resolve(process.cwd(), 'api', `${apiName}.js`);

        if (!fs.existsSync(apiFile)) {
          return next();
        }

        try {
          // Parse request body if method is POST/PUT/DELETE
          let body = {};
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
            body = await new Promise((resolve) => {
              let raw = '';
              req.on('data', (chunk: Buffer | string) => { raw += chunk; });
              req.on('end', () => {
                try {
                  resolve(raw ? JSON.parse(raw) : {});
                } catch {
                  resolve({});
                }
              });
            });
          }

          // Prepare query object
          const query: Record<string, string> = {};
          for (const [k, v] of urlObj.searchParams.entries()) {
            query[k] = v;
          }

          // Attach query and body
          const customReq = req as ApiRequest;
          const customRes = res as ApiResponse;
          customReq.query = query;
          customReq.body = body;

          // Enhance res with Express/Vercel helpers
          customRes.status = function (statusCode: number) {
            this.statusCode = statusCode;
            return this;
          };
          customRes.json = function (data: unknown) {
            if (!this.headersSent) {
              this.setHeader('Content-Type', 'application/json');
            }
            this.end(JSON.stringify(data));
            return this;
          };

          // Dynamically load the module so edits are immediately reflected
          const mod = await server.ssrLoadModule(`./api/${apiName}.js`);
          const handler = mod.default || mod;
          await handler(customReq, customRes);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
          console.error(`[api-middleware] Error handling ${req.url}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: errorMsg }));
          }
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  const plugins = [apiMiddleware(), react(), tailwindcss()];

  const env = loadEnv(mode, process.cwd(), ['VITE_', 'NEXT_PUBLIC_']);
  const processEnvDefines: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    processEnvDefines[`process.env.${key}`] = JSON.stringify(value);
  }

  return {
    plugins,
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    define: processEnvDefines,
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
                return 'vendor-react';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              if (id.includes('jspdf') || id.includes('html2canvas')) {
                return 'vendor-pdf';
              }
              if (id.includes('framer-motion') || id.includes('canvas-confetti')) {
                return 'vendor-animation';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (id.includes('@supabase')) {
                return 'vendor-supabase';
              }
              return undefined;
            }
          },
        },
      },
    },
    server: {
      watch: {
        ignored: ['**/scratch/**', '**/scratch/**/*', '**/.tempmediaStorage/**', '**/playwright-report/**', '**/.playwright-mcp/**'],
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
})
