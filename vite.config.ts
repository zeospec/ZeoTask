import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

function devServiceWorkerMiddleware(): Plugin {
  return {
    name: 'dev-service-worker-middleware',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/sw.js') {
          res.setHeader('Content-Type', 'text/javascript')
          res.end(
            "// Dev fallback for stale production SW registrations\n" +
            "self.addEventListener('install', () => self.skipWaiting());\n" +
            "self.addEventListener('activate', () => self.registration.unregister());\n",
          )
          return
        }
        if (req.url === '/firebase-messaging-sw.js') {
          res.setHeader('Content-Type', 'text/javascript')
          res.end('// Dev fallback for Firebase messaging SW\n')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [
    devServiceWorkerMiddleware(),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-512-maskable.png',
      ],
      manifest: {
        name: 'ZeoTask',
        short_name: 'ZeoTask',
        description: 'Personal tasks',
        theme_color: '#315F55',
        background_color: '#F4F7F6',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        lang: 'en',
        categories: ['productivity'],
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) {
            return 'firebase'
          }
          if (id.includes('node_modules/chrono-node') || id.includes('node_modules/date-fns')) {
            return 'nlp-date'
          }
          if (id.includes('node_modules/@dnd-kit')) {
            return 'dnd'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor'
          }
        },
      },
    },
  },
})
