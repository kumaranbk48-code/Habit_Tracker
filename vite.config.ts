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
        const apiName = urlObj.pathname.replace(/^\/api\//, '').split('/')[0];
        let apiFile = path.resolve(process.cwd(), 'api', '_routes', `${apiName}.js`);
        let modPath = `./api/_routes/${apiName}.js`;

        if (!fs.existsSync(apiFile)) {
          apiFile = path.resolve(process.cwd(), 'api', `${apiName}.js`);
          modPath = `./api/${apiName}.js`;
        }

        if (!fs.existsSync(apiFile)) {
          return next();
        }

        try {
          // Parse request body if method is POST/PUT/DELETE (100kb cap + strict JSON errors)
          const MAX_BODY_BYTES = 100 * 1024;
          let body: unknown = {};
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
            const contentLength = Number(req.headers['content-length'] || 0);
            if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Payload too large — maximum body size is 100kb' }));
              return;
            }

            const bodyResult = await new Promise<{ body?: unknown; status?: number; error?: string }>((resolve) => {
              let settled = false;
              const chunks: Buffer[] = [];
              let totalBytes = 0;

              const settle = (result: { body?: unknown; status?: number; error?: string }) => {
                if (!settled) {
                  settled = true;
                  resolve(result);
                }
              };

              req.on('data', (chunk: Buffer | string) => {
                if (settled) return;
                const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), 'utf8');
                totalBytes += buf.length;
                if (totalBytes > MAX_BODY_BYTES) {
                  chunks.length = 0;
                  req.resume();
                  settle({ status: 413, error: 'Payload too large — maximum body size is 100kb' });
                  return;
                }
                chunks.push(buf);
              });

              req.on('end', () => {
                if (settled) return;
                const raw = Buffer.concat(chunks).toString('utf8').trim();
                if (!raw) {
                  settle({ body: {} });
                  return;
                }
                try {
                  settle({ body: JSON.parse(raw) });
                } catch {
                  settle({ status: 400, error: 'Invalid JSON request body' });
                }
              });

              req.on('error', () => {
                settle({ status: 400, error: 'Invalid request body stream' });
              });
            });

            if (bodyResult.status) {
              res.statusCode = bodyResult.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: bodyResult.error }));
              return;
            }
            body = bodyResult.body ?? {};
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
          const mod = await server.ssrLoadModule(modPath);
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
        usePolling: true,
        interval: 300,
        ignored: [
          '**/scratch/**',
          '**/scratch/**/*',
          '**/.tempmediaStorage/**',
          '**/playwright-report/**',
          '**/.playwright-mcp/**',
          '**/node_modules/**',
          '**/.git/**',
          '**/dist/**'
        ],
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
