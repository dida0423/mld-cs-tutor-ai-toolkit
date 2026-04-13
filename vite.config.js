import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Proxies OpenAI so the browser never sees OPENAI_API_KEY (dev server only).
// https://vite.dev/config/server-options.html#server-proxy
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const openAiKey = env.OPENAI_API_KEY

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/openai': {
          target: 'https://api.openai.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/openai/, ''),
          configure(proxy) {
            proxy.on('proxyReq', (proxyReq) => {
              if (openAiKey) {
                proxyReq.setHeader('Authorization', `Bearer ${openAiKey}`)
              }
            })
          },
        },
      },
    },
  }
})
