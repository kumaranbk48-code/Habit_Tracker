import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

function apiMiddleware() {
  return {
    name: 'api-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: () => void) => {
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
              req.on('data', (chunk: any) => { raw += chunk; });
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
          req.query = query;
          req.body = body;

          // Enhance res with Express/Vercel helpers
          res.status = function (statusCode: number) {
            res.statusCode = statusCode;
            return res;
          };
          res.json = function (data: any) {
            if (!res.headersSent) {
              res.setHeader('Content-Type', 'application/json');
            }
            res.end(JSON.stringify(data));
            return res;
          };

          // Dynamically load the module so edits are immediately reflected
          const mod = await server.ssrLoadModule(`./api/${apiName}.js`);
          const handler = mod.default || mod;
          await handler(req, res);
        } catch (err: any) {
          console.error(`[api-middleware] Error handling ${req.url}:`, err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Internal Server Error' }));
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
