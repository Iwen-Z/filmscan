<!-- cc-auto:ops 开始 · 本段由 cc 工具链自动维护，勿手改 -->
## 🤖 运维事实（自动记录）

- 本应用现为 **Vite + 原生 TypeScript** 工程（产物是静态 HTML/JS/CSS，**运行时零 UI 框架**，仅 Canvas + 原生 DOM）。常用命令：
  - `npm install` — 安装依赖（首次/clone 后必跑）。
  - `npm run dev` — 开发服务器（默认 `http://localhost:5173`，HMR）。
  - `npm run build` — 产出 `dist/`（静态产物，可直接静态托管）。
  - `npm run preview` — 本地预览 `dist/` 产物（默认 `http://localhost:4173`）。
  - `npm run selftest:headless` — 一键无头验证：`build` → `vite preview` → 无头 Chrome 跑 `?selftest` → grep 浮层判 PASS/FAIL（脚本 `scripts/selftest-headless.sh`，退出码 0/1）。
- 入口 `index.html`（引 `/src/main.ts`），源码 `src/*.ts` 按域拆模块；类型检查 `npx tsc --noEmit`。
- **页内自检 harness**：任一模式下 URL 加 `?selftest` 会动态 import `src/selftest.ts` 跑断言，右下角浮层显示 `SELFTEST PASS`（绿）/`SELFTEST FAIL`（红）。无头验证用上面的 `npm run selftest:headless`。
- 纯前端、不上传服务器，照片只在浏览器本地处理；**不引入运行时 UI 框架**是约束，加功能保持原生 TS + Canvas。
<!-- cc-auto:ops 结束 -->

## 本地运行 / 导出的坑（手写，勿被 cc-auto 覆盖）

- **导出图片要用本地服务器跑（`npm run dev` 或 `npm run preview`），别用 `file://` 双击打开**：内置示例卷的图来自 `public/images/`（Vite 同源 serve 到根 `/images`）。`file://` 把每个本地文件当独立安全源 → 画布被「污染」(tainted canvas) → `toBlob` 抛 `SecurityError`、下载失败。页面一打开就 seed 了示例卷，所以 `file://` 下导出默认必废。**Vite dev/preview 已是同源 HTTP**，不污染、导出正常——不再需要手动起 `python3 -m http.server`。
- 起服务器：`npm install` 后 `npm run dev` → 开 `http://localhost:5173`（或 `npm run preview` 跑 build 产物）。
- 例外：**用户自己导入的照片走 `URL.createObjectURL` blob URL，同源不污染**——只导入自己的图、不碰示例卷，`file://` 下也能导出。会污染的只有 `public/images/` 示例图。
- **示例照片本地不入库**：`public/images/` 已 gitignore（私人实拍），clone 后默认没有示例图，把图补进 `public/images/` 即可被 `src/presets.ts` 的 `SAMPLE_IMAGES` 命中。故不内联成 base64（会撑大产物，且与「示例照片不入库」的决定冲突，不采用）。

## 部署（GitHub Pages 项目站）

- 默认 `vite build` 的 `base` 是 `/`（适合根路径托管 / 自定义域名 / Vercel）。`base` 没写死在 `vite.config.ts`，是为了本地 dev/preview/无头 selftest 仍跑在根路径、`?selftest` 不回归。
- 部署到 GitHub Pages 项目站 `https://Iwen-Z.github.io/filmscan/`（子路径）时：
  1. `BASE_PATH=/filmscan/ npm run build` —— 让 `dist/` 资源指向 `/filmscan/` 子路径。
  2. 把 `dist/` 内容推到 `gh-pages` 分支根目录（例如 `git subtree push --prefix dist origin gh-pages`，或用任意 gh-pages 发布工具）。
  3. GitHub 仓库 Settings → Pages 选 `gh-pages` 分支 `/`（root）。
