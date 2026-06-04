# 剩余工作 spec — 重构收尾(阶段 2→6)+ 持久化,一条串行链

> 总控 doc:把 `REFACTOR_VITE_SPEC.md` 的阶段 2–6 和 `PERSIST_SPEC.md` 整合成一条**严格串行**的执行链,交 ginger 无人值守跑。
> 本 doc 自包含调度所需信息;阶段 2–5 的细节仍以 `REFACTOR_VITE_SPEC.md` 对应章节为准,阶段 6(持久化)细节以 `PERSIST_SPEC.md` 为准,**但其代码锚点以本 doc §阶段6 的「锚点映射」为准**(旧 spec 写的是重构前单文件行号,已过时)。
> **不在本轮范围**:`FILM_LOOK_SPEC.md`(胶片质感/漏光/印字)整轮不做——视觉验收 `?selftest` 兜不住,留人工把关。**任何阶段都不要碰 `renderPieceFilm` 的视觉表现**,只允许重构搬运时保持其行为不变。

## 现状锚点(已落地的事实,从这里接着干)

- 阶段 0 ✅(PR #9):Vite/TS 脚手架,`images/` 入 `public/`,旧 `index.html` 原样跑通。
- 阶段 1 ✅(PR #10):CSS/JS 外置。**当前** `index.html` = 92 行 DOM 骨架 + `<script type="module" src="/src/main.ts">`;`src/main.ts` = 1053 行、顶部 `// @ts-nocheck`(整块搬来未改);`src/styles.css`。
- `?selftest` 断言仍在 `main.ts` 内(grep `selftest` 命中 3 处),浮层 PASS/FAIL 机制不变。
- 数据结构(现为注释/隐式,阶段 2–3 正式落类型):`Roll={id,name,shots:Shot[],filmType,sample?}`、`Shot={url,img}`、`Piece={id,rollId,x,y,z,el,canvas,ctx,shots}`、`FilmType='reversal'|'bw'|'negative'`。

## 全程不变量(每个 PR 合并前都要满足,QA 必验)

- `npm run dev` 起得来;摆卷 / 剪单张 / 切边框 / 切卷类型 / 导出 五条主路径行为与重构前一致。
- `?selftest` = `SELFTEST PASS`(dev 下;阶段 4 起 build 产物 preview 下也要 PASS)。
- 运行时**零 UI 框架**;Vite/TS/类型只在开发期。
- 照片只在浏览器本地处理,**绝不上传服务器**;持久化也只落本地 IndexedDB。
- 导出 `toBlob` 不被 tainted canvas 污染(示例图同源 serve,已在 `public/`)。
- 每阶段**独立 PR**;`node --check`(或 `tsc --noEmit`)过;不破前一阶段成果。

---

## 阶段 2 — 类型骨架 + 按域拆模块

细节见 `REFACTOR_VITE_SPEC.md` §阶段 2。要点:

1. `src/types.ts`:`Roll`/`Shot`/`Piece`/`FilmType`/`FILM_TYPES`。
2. 把 1053 行 `main.ts` 按域拆出:`state.ts` / `render.ts` / `deck.ts` / `pieces.ts` / `frames.ts` / `rolls.ts`(newRoll/cycleRollType/deleteRoll/removeShot/moveShot/addFiles)/ `tray.ts` / `presets.ts`(save+导出 toBlob+seedSampleRoll)/ `selftest.ts`(`?selftest` 断言,入口动态 `import()` 仅带 query 时加载)。`main.ts` 收为入口:取 DOM + 绑事件 + 初始化 + seed。
3. 逐模块去 `@ts-nocheck`,import/export 接线。

验收:`main.ts` 仅入口编排;各域成模块,最大文件远小于 1050 行;功能 + selftest 不变。

## 阶段 3 — 补类型、消 any、收紧 tsconfig

细节见 §阶段 3。`tsconfig` 渐进开 `strict`(至少 `noImplicitAny`+`strictNullChecks`);`Roll/Shot/Piece` 全链路类型贯通;`tsc --noEmit` 零错。验收:strict 子集下类型检查过,功能 + selftest 不变。

## 阶段 4 — selftest / 无头验证迁移到 Vite

细节见 §阶段 4。`?selftest` 在 dev 与 **build 产物 preview** 下都 PASS;无头验证从 `file://` 改 http(localhost/preview)+ 无头 Chrome 读浮层(file:// 下 ESM 受 CORS 不可用);落一个可重跑脚本(如 `npm run selftest:headless`)。验收:两种模式 selftest 均 PASS;脚本一键重跑。

## 阶段 5 — 文档 + 部署收尾

细节见 §阶段 5。**重写 `CLAUDE.md`**:删旧「单文件/零依赖/零构建/双击即跑」,写新 dev/build/test/部署流程(运行时仍零框架、纯静态产物);保留「`images/` 示例图会污染 `file://` 导出」「示例照片本地不入库」两条仍成立的运维坑。部署:`vite build`→`dist/`,若上 GitHub Pages 配 `base`。更新 README/页内运维事实。验收:文档与新工具链一致;`build` 产物可部署;`npm i && npm run dev` 即跑。

## 阶段 6 — 持久化(IndexedDB,导入卷刷新不丢)

**功能与验收以 `PERSIST_SPEC.md` 为准**(决策:IndexedDB 直存 Blob;只持久化用户导入的卷,示例卷不入库;持久化范围=tray 里的卷 `{id,name,filmType,shots 顺序+每帧 Blob}`,piece 台面摆放不持久化;启动时库有用户卷则恢复且不 seed 示例,库空才 seed;`?selftest` 绝不读写库)。

**锚点映射(覆盖 PERSIST_SPEC 里的旧行号——那些指向重构前的单文件,现已不成立)**:

| PERSIST_SPEC 旧锚点(单文件行号) | 重构后实际位置 |
|---|---|
| 新增持久层(IndexedDB 封装) | 新建 `src/persist.ts`:`persistRoll(roll)` / `deleteRollFromDB(id)` / `loadAllRolls()`,全异步 try/catch,`QuotaExceeded` 轻提示别崩 |
| `addFiles`(旧 903)导入写时机 | `rolls.ts` 的 `addFiles`:`File` 即 Blob,导入后 `persistRoll(roll)` |
| `deleteRoll`(旧 878)/`removeShot`(旧 884)/`moveShot`(旧 891,源+目标卷都更新)/`cycleRollType`(旧 871) | 均在 `rolls.ts`:改卷后调 `persistRoll`/`deleteRollFromDB` |
| `seedSampleRoll`(旧 1221)+ 示例标记 | `presets.ts`:示例卷显式打 `roll.sample=true`,持久层跳过 sample 卷 |
| 启动 seed 判定(旧 1236）/ 恢复 | `main.ts` 入口(非 selftest):`await loadAllRolls()` → 有用户卷则重建 `rolls`(每帧 Blob→`createObjectURL`→`new Image()`,onload 后 `rerenderPiecesByRoll`+`renderTray`)、`nextId=max(恢复id)+1`、**不 seed**;库空才 `seedSampleRoll()` |
| selftest 分支(旧 1239) | `selftest.ts`:不触发任何 DB 调用;可加 1 条同步断言「持久层函数存在且 selftest 下未写库」 |

验收以 PERSIST_SPEC §验收:导入→刷新仍在;删卷/删帧→刷新不复活;filmType 持久;moveShot 后归属正确;库有用户卷时启动不出示例、清库后才出示例;`?selftest` PASS 且不写库。

---

## 给 ginger 的调度提示

- **阶段 2→3→4→5→6 严格串行**,各独立 PR,`?selftest` PASS 是每个 PR 的底线(QA 用无头验证,见阶段 4 脚本/或 file→http 过渡期手法)。后一阶段建立在前一阶段的模块结构上,**不可并行**(同文件搬运/接缝,易撞)。
- 阶段 2 内部各模块拆分可细分多个小 PR,但彼此仍串行。
- 阶段 6 与阶段 2–5 也串行(它依赖 `rolls.ts`/`presets.ts`/`main.ts` 等模块已在阶段 2 拆好)。
- **红线**:不引入 UI 框架/新运行时依赖;不上传照片;不动 `renderPieceFilm` 视觉表现;`FILM_LOOK_SPEC` 整轮不碰。
- 每阶段 commit/PR 留痕,验收不过就回炉,别带病往下一阶段。
