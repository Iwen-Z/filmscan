import { defineConfig } from 'vite'

// public/ 下内容(含 public/images 示例卷)在 dev/build 时同源 serve 到根 `/`
//   → SAMPLE_IMAGES 的 'images/...' 仍命中,且同源不污染画布(导出 toBlob 正常)。
//
// base 资源路径:默认 '/'。本地 dev/preview 与无头 selftest 都跑在根路径,
//   所以 base 不写死成 '/filmscan/'——否则 `vite preview` 会服务在子路径,
//   scripts/selftest-headless.sh 访问的 `http://localhost:4173/?selftest` 会 404(?selftest 回归)。
// 部署 GitHub Pages 项目站(https://Iwen-Z.github.io/filmscan/,子路径托管)时,
//   用  BASE_PATH=/filmscan/ npm run build  让 dist/ 资源指向 /filmscan/(见 CLAUDE.md「部署」)。
const base = (globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.BASE_PATH || '/'

export default defineConfig({
  base,
  build: {
    // 大图(示例卷)别被内联成 base64,保持外链
    assetsInlineLimit: 0,
  },
})
