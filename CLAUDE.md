## 交互模型（设计约束 · 手写勿被 cc-auto 覆盖）

核心是「真实灯箱 + 拼图手感」，**别做成网页控件**（第一版偏了被否：活动范围限在框内 / 加了移动把手 / 长条还能片内滚动，全否）。

- **观片台 = 固定在中央的发光矩形窗**，只是视觉 + **导出画框**，不是胶卷的活动边界。导出 = 给那块矩形拍快照（露在框外的胶片被裁掉）。
- **胶卷 = 整屏可自由摆放的实物**，活动范围是整屏、不止观片台框内。
- **拖出即跟随**：从右侧 tray 抓某卷立刻跟在光标上（不是松手后才出现），拖出 tray 与桌上移动**共用同一套 pointer 机制**。
- **一体操作**：抓本体就拖整条——**不要把手、不要片内滚动**。长卷要看后面的帧就**整条滑过去**让那几帧落到发光窗上。
- **拖回右侧 tray = 移除**。

需求是迭代聊出来的，先确认模型再让工作流跑。卷相关 UX 细节见 `docs/ROLL_UX_SPEC.md`。

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

## 架构地图（手写 · 给规划者少绕路用 · 改了模块边界就同步）

> 目的：规划新需求时先看这张图定位「动哪几个文件」，不必挨个打开 13 个 `src/*.ts` 重建依赖图。每个文件头自带一行域注释，这里只给**依赖分层**和**需求→文件**反查。

**依赖分层（上层 import 下层，无环）**：
- `types.ts` — 全局契约：`FilmType`/`Shot`/`Roll`/`Piece`、`FILM_TYPES`、`rollFilmType`/`filmTypeLabel`。下游全从这 import 类型。
- `core.ts` — 共享内核：DOM 取用器 `$`、台面常量 `TW/TH`、`films` 规格表、`deckScale`、纯工具。无业务。
- `state.ts` — 全局可变态 + setter（`rolls`/`pieces`/`selected`/`glow`/`radius`/`filmIdx`、`rollById`）。ESM 绑定不可重赋值，故整体替换/自增走 setter。
- `render.ts` — 渲染域：`renderBg`（发光台面）、`pieceLayout`（几何）、`renderPiece`/`Bare`/`Polaroid`/`Film`（按 frameStyle 画 canvas）。**胶片质感所有阶段都改这里的 `renderPieceFilm`/`pieceLayout`**。
- 业务域（互相平级，都依赖上面四层）：
  - `deck.ts` — 观片台机身 + piece 的 CSS 布局/视口夹取。
  - `pieces.ts` — 台面 piece：新建/移除/重渲 + 统一 pointer 拖动。
  - `frames.ts` — 选帧/剪下/边框样式工具条。
  - `rolls.ts` — 卷操作：新建/切类型/删卷/删帧/移帧/导入照片。
  - `tray.ts` — 右侧候选区（按卷分组）：`drawCoil` 胶圈缩略 + `showExpand`/`hideExpand` hover 展开预览 + `renderTray`。
  - `presets.ts` — 导出 `save` / 标签同步 / **画幅规格选择 `selectFilm`/`setFmt`（现为全局态 `filmIdx`，非 per-roll）** / 抽屉。
  - `persist.ts` — 用户卷存 IndexedDB（db=filmscan/store=rolls；只存 `shot.blob`，url/img 恢复时重建）。
- `main.ts` — 入口编排：只做 DOM 取用 + 事件绑定 + 初始化，**不含业务函数体**（业务全下沉到上面）。
- `selftest.ts` — `?selftest` 时 main 动态 import，跑断言出 PASS/FAIL 浮层。

**需求 → 动哪些文件（反查）**：
- 画面/胶片质感（漏光/印字/暗角/halation/灰尘…）：`render.ts`（`renderPieceFilm`/`pieceLayout`）为主，开关态进 `state.ts`/`types.ts`。
- 画幅/规格：已 **per-roll**：`Roll.filmIdx`（`types.ts`，`rollFilmIdx(roll)` 旧卷缺字段兼容=135）+ `core.ts` `films` 规格表。读画幅的地方：`render.ts`（`pieceLayout` 按卷画幅）、`tray.ts`（`drawFrameThumb` 缩略图比例）。卷的画幅在新建/设置弹窗里选（见下条），不再是全局 `presets.ts` `selectFilm`。
- 新建卷流程/弹窗（弹窗即设置）：`rolls.ts`（`newRoll`/`updateRollSettings`）+ `main.ts` 接线 + `index.html`/`styles.css` 的 modal；卷类型/画幅/张数上限都在这弹窗里设。
- 右侧候选区外观/动画（暗盒形态 + 卷轴抽出展开）：`tray.ts`（`drawCanister` 暗盒缩略 / `renderTray` / `showExpand`+`hideExpand` 加减 `.expand-visible` class / `drawFrameThumb` per-roll 比例）+ `styles.css`（`#rollExpand` transform+transition 卷轴动画、canvas nth-child 级联 delay）。
- 拖拽/选帧/剪下：`pieces.ts`（拖）/ `frames.ts`（选剪）。
- 导出：`presets.ts` `save`（注意 tainted canvas 坑，见下节）。

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
