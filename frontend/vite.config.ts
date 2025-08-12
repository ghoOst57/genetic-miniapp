import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    legacy({
      // даём запас по старым вебвью Telegram
      targets: ['defaults', 'not IE 11', 'iOS >= 12', 'Android >= 7'],
      modernPolyfills: true,
      renderLegacyChunks: true,
      additionalLegacyPolyfills: ['whatwg-fetch'],
    }),
  ],
  build: {
    // понижаем таргет, чтобы Safari/WKWebView не падал
    target: ['es2018', 'safari13'],
  },
})
