# 重构 spec — 单文件 index.html → Vanilla TS + Vite(认真维护版)

> 背景：`index.html` 1369 行(CSS 7–232 / HTML 体 232–316 / JS `<script>` 316–1367 约 1050 行),单文件难维护、每次全看。决定转向 **Vanilla TS + Vite**(无 UI 框架——这是 canvas 渲染为主的 app,框架范式与命令式 canvas 不搭)。
> **此 spec 推翻 CLAUDE.md 旧硬约束「单文件 / 零依赖 / 零构建 / 双击即跑」**;改为零 **UI 框架** + 有构建(Vite/TS 仅 devDeps,产物仍是纯静态 HTML/JS/CSS,运行时零框架依赖)。
> 路线:**绞杀式渐进迁移**,不大爆炸重写。每阶段独立 PR、app 始终能跑、`?selftest` 始终 PASS(`?selftest` harness 是本项目的命脉验证手段,全程不能断)。
> 时序:持久化(`PERSIST_SPEC.md`)**推迟到重构完成后**做(阶段 6),其代码锚点届时按新模块结构重写。

## 不变量(每阶段 PR 合并前都要满足)

- `npm run dev` 起得来,页面功能与重构前一致(摆卷/剪单张/切边框/切卷类型/导出)。
- `?selftest` = `SELFTEST PASS`(dev 下;阶段 4 起 build 产物下也要 PASS)。
- 运行时**零 UI 框架**;Vite/TS/类型仅开发期。
- 照片仍只在浏览器本地处理,不上传服务器。
- 导出 `toBlob` 不被 tainted canvas 污染(示例图 `images/` 要同源 serve,见阶段 0)。

## 现状锚点(代码事实)

- 单 `<script>` 316–1367,全局态:`rolls`/`pieces`/`nextId`/`zTop`/`selected`/`importTarget` 等(322 起)。
- 函数按域(行号):
  - 渲染:`renderBg`(388)`drawPhotoCover`(402)`pieceLayout`(416)`renderPiece`(441)`renderPieceBare/Polaroid/Film`(449/464/492)`renderAllPieces/render`(578/579)`rr`(376)
  - 观片台/布局:`applyDeck`(582)`updatePlaceholder`(594)`deckRect`(600)`layoutPieceEl`(601)`clampPieceToViewport`(609)`centerPieceAt`(618)`raisePiece`(624)
  - piece:`addPiece`(628)`removePiece`(648)`removePiecesByRoll`(655)`rerenderPiecesByRoll`(662)`cascadePos`(669)`inTray`(676)
  - 拖拽:`startPieceDrag`(680)`endPieceDrag`(703)`bindPieceEvents`(732)
  - 帧选择/剪切:`frameAt`(743)`ensureCutBtn`(756)`positionCutBtn`(765)`setSelection`(778)`clearSelection`(784)`selectFrame`(791)`cutSelected`(800)
  - 边框工具条:`ensureFrameBar`(817)`toggleFrameBar`(830)`openFrameBar`(834)`closeFrameBar`(839)`positionFrameBar`(843)`setFrameStyle`(855)`pieceFrameStyle`(398)
  - 卷/帧:`newRoll`(864)`cycleRollType`(871)`deleteRoll`(878)`removeShot`(884)`moveShot`(891)`addFiles`(903)
  - tray/胶圈:`drawCoil`(921)`drawFrameThumb`(953)`showExpand`(974)`hideExpand`(995)`scheduleHideExpand`(1000)`cancelHideExpand`(1004)`renderTray`(1007)
  - 预设/抽屉/seed:`save`(1057,含导出)`syncLabels`(1075)`selectFilm`(1081)`toggleDrawer`(1210)`seedSampleRoll`(1221)
  - 自检:`?selftest` 分支 1239+
- 数据结构(待类型化):`Roll = {id,name,shots:Shot[],filmType,sample?}`、`Shot = {url,img}`、`Piece = {id,rollId,x,y,z,el,canvas,ctx,shots}`、`FilmType = 'reversal'|'bw'|'negative'`、`FILM_TYPES[]`。

---

## 阶段 0 — Vite/TS 脚手架,现有代码原样跑通(零行为变化)

1. `npm init` + 装 devDeps:`vite`、`typescript`。`package.json` scripts:`dev`/`build`/`preview`。
2. `vite.config.ts`(`base` 留待阶段 5 按部署定)、`tsconfig.json`(先**不**开 strict,允许后续渐进收紧)。
3. **现有 `index.html` 原样作为 Vite 入口**(Vite 默认根 `index.html`),内联 `<style>`/`<script>` **暂不动**。`images/` 移到 `public/`(Vite 同源 serve → 导出不被污染)。
4. `.gitignore` 加 `node_modules/`、`dist/`。
5. 验证:`npm run dev` 页面功能正常;`npm run build && npm run preview` 产物可跑;`?selftest` 两种模式都 PASS。

验收:能 dev/build/preview;行为与重构前**逐像素**一致;selftest PASS。

## 阶段 1 — 外置 CSS / JS(还不拆模块、不加类型)

1. `<style>`(7–232) → `src/styles.css`,入口 import。
2. `<script>`(316–1367)整块 → `src/main.ts`,顶部暂挂 `// @ts-nocheck`(先搬不改)。`index.html` 收为骨架 + `<script type="module" src="/src/main.ts">`。
3. 验证不变量。

验收:`index.html` 只剩 DOM 骨架;CSS/JS 各自成文件;功能 + selftest 不变。

## 阶段 2 — 类型骨架 + 按域拆模块

1. `src/types.ts`:`Roll`/`Shot`/`Piece`/`FilmType`/`FILM_TYPES` 等接口与常量。
2. 拆模块(每个可独立小 PR,或本阶段内分步;拆一个验一次):
   - `state.ts`(全局态 + 访问器:rolls/pieces/nextId/zTop/selected…)
   - `render.ts`(renderBg/drawPhotoCover/pieceLayout/renderPiece*/render)
   - `deck.ts`(applyDeck/布局/layoutPieceEl/centerPieceAt/deckRect…)
   - `pieces.ts`(addPiece/removePiece/by-roll/cascadePos/inTray + 拖拽 startPieceDrag/endPieceDrag/bindPieceEvents)
   - `frames.ts`(帧选择/剪切 + 边框工具条 setFrameStyle…)
   - `rolls.ts`(newRoll/cycleRollType/deleteRoll/removeShot/moveShot/addFiles)
   - `tray.ts`(drawCoil/drawFrameThumb/showExpand/renderTray…)
   - `presets.ts`(save/syncLabels/selectFilm + 导出 toBlob/seedSampleRoll)
   - `selftest.ts`(`?selftest` 断言,入口动态 `import()`,仅带 `selftest` query 时加载)
   - `main.ts`(入口:DOM 取元素 + 事件绑定 + 初始化 + seed)
3. 模块间依赖用 import/export,逐个去 `@ts-nocheck`。

验收:`main.ts` 仅入口/编排;各域成模块、最大文件远小于现 1050 行;功能 + selftest 不变。

## 阶段 3 — 补类型、消 any、收紧 tsconfig

1. 逐模块补类型,消除隐式 any;`tsconfig` 渐进开 `strict`(或至少 `noImplicitAny`+`strictNullChecks`)。
2. `Roll/Shot/Piece` 全链路类型贯通(此前注释里的结构正式落为类型)。
3. `npm run build` 类型检查零错。

验收:strict(或约定子集)下 `tsc --noEmit` 通过;功能 + selftest 不变。

## 阶段 4 — selftest / 无头验证迁移到 Vite

1. `?selftest` 在 dev 与 **build 产物**(preview)下都跑、都 PASS。
2. 无头验证从 `file://...?selftest` 改为 **http(localhost/preview)** + 无头 Chrome 读浮层(file:// 下 ESM 受 CORS 不可用)。
3. 落一个可重跑的验证脚本(如 `npm run selftest:headless`,起 preview → 无头读浮层背景色/文本)。

验收:dev 与 build 产物 selftest 均 PASS;无头验证脚本可一键重跑。

## 阶段 5 — 文档 + 部署收尾

1. **重写 `CLAUDE.md`**:删旧「单文件/零依赖/零构建/双击即跑」,写新 dev/build/test/部署流程(运行时仍零框架、纯静态产物)。
2. 部署:`vite build` → `dist/`;若上 GitHub Pages 配 `base` + 部署步骤。更新本地运行说明(已用服务器,迁移后即 `npm run dev`)。
3. 更新页内/README 运维事实。

验收:文档与新工具链一致;`build` 产物可部署;新人 `npm i && npm run dev` 即跑。

## 阶段 6(重构完成后)— 持久化

- 按 `PERSIST_SPEC.md`(IndexedDB)在新模块(`persist.ts` + `rolls.ts`/`state.ts` 接缝)实现;该 spec 的代码锚点(行号/函数)届时按新结构重写。

## 给 ginger 的调度提示

- 阶段 0→5 **严格串行**(每阶段依赖前一阶段的脚手架/结构),各独立 PR,`?selftest` PASS 是每个 PR 的底线。
- 阶段 0(脚手架 + npm install)是地基,**建议人工把关确认**后再往后跑。
- 阶段 2 内部各模块拆分可细分多个小 PR,但彼此串行(同文件搬运,易撞)。
