import { defineConfig } from 'vite'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const dir = fileURLToPath(new URL('.', import.meta.url))

const COND_STYLES_ID = '/@slidev/conditional-styles'

export default defineConfig({
  plugins: [
    {
      // Windows+OneDrive workaround: Slidev's virtual module generates malformed relative paths
      // from POSIX virtual ID (/@slidev/conditional-styles) to Windows absolute paths (C:/...).
      // We intercept the module and return direct absolute imports instead.
      name: 'fix-slidev-conditional-styles',
      enforce: 'pre',
      resolveId(id) {
        if (id === COND_STYLES_ID) return id
      },
      load(id) {
        if (id !== COND_STYLES_ID) return

        const themeStyles = resolve(dir, 'node_modules/@slidev/theme-default/styles/index.ts')
        const userStyle = resolve(dir, 'style.css')
        const lines: string[] = []

        if (existsSync(themeStyles)) lines.push(`import ${JSON.stringify(themeStyles.replace(/\\/g, '/'))}`)
        if (existsSync(userStyle)) lines.push(`import ${JSON.stringify(userStyle.replace(/\\/g, '/'))}`)

        return lines.join('\n') || 'export {}'
      },
    },
  ],
  server: {
    fs: { strict: false },
  },
})
