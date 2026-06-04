import { defineConfig } from 'vite'

// 阶段0脚手架:现有 index.html 原样作入口,内联 <style>/<script> 暂不动。
// public/ 下内容(含 public/images 示例卷)在 dev/build 时同源 serve 到根 `/`
//   → SAMPLE_IMAGES 的 'images/...' 仍命中,且同源不污染画布(导出 toBlob 正常)。
// 部署 base 留待重构阶段5按部署目标定;先本地 `npm run dev`。
export default defineConfig({
  build: {
    // 大图(示例卷)别被内联成 base64,保持外链
    assetsInlineLimit: 0,
  },
})
