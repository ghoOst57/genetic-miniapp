import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(async () => {
  // Пытаемся подключить legacy-плагин, но не валимся, если его нет
  let legacy: any = null
  try {
    legacy = (await import('@vitejs/plugin-legacy')).default
  } catch {
    // плагин не найден — пропустим, сборка продолжится
  }

  return {
    plugins: [
      react(),
      legacy && legacy({
        targets: ['defaults', 'not IE 11', 'iOS >= 12', 'Android >= 7'],
        modernPolyfills: true,
        renderLegacyChunks: true,
        additionalLegacyPolyfills: ['whatwg-fetch'],
      }),
    ].filter(Boolean),
    build: {
      target: ['es2018', 'safari13'],
    },
  }
})
