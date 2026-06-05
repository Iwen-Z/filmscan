# 卷 UX 改造 spec — 画幅 per-roll / 新建即设置弹窗 / 硬张数上限 / 平视暗盒 / 卷轴展开动画

> 背景：四项交互/数据模型改造，先于 `FILM_LOOK_SPEC`（片基质感/镜头拟真）做。把"画幅"从全局降到 per-roll，新建卷走 modal（画幅+类型+张数上限三选一处定），右侧候选区从俯视盘改成平视竖立的 35mm 暗盒，hover 展开加卷轴抽片动画。
> 约束：纯原生 + 零运行时 UI 框架（仅 Canvas + 原生 DOM），Vite + TS 工程。复用现有 `Roll`/`pieceLayout`/`renderTray`/`showExpand`/`drawCoil`/`drawFrameThumb`。
> 地基：阶段 1（画幅 per-roll）是其余各项的数据地基，**必须最先 merge**。
> **1→2→3 是数据链（types/rolls/persist/index.html），4→5 同改 tray.ts+styles.css**，全部串行、各独立 PR。给 ginger 的调度提示见末尾。
> 架构定位见仓库 `CLAUDE.md` 的「架构地图」反查表。

## 决策（已和用户敲定 2026-06-05）

- **画幅 per-roll**：现全局态 `filmIdx`（`state.ts:36`，默认 1=135）下沉到 `Roll`。`pieceLayout`（`render.ts:61`）改读所属卷画幅。**底部 dock 画幅 chips（`#films`）+ 抽屉「画幅规格」seg（`#filmSeg`）全部移除**——画幅只在卷设置里改。
- **弹窗即设置（新建+编辑共用）**：一个 modal，新建卷时弹出选画幅/类型/张数；建好后点卷头入口可重新打开编辑同一组属性。替换现有三按钮小面板 `#newRollPanel`。
- **张数上限 = 硬上限**：导入到上限即停，多余照片不进卷并提示。像真实 24/36 张定额。旧持久化卷无 cap 字段 → 向后兼容视为不限。
- **平视外观 = 35mm 胶卷暗盒（竖立金属罐）**：金属罐立在台面上，顶部轴心凸起，底部露一截片头（leader）。替换现 `drawCoil` 的俯视同心盘。
- **hover 卷轴展开动画**：从暗盒罐口把胶片条"抽出"的动画（CSS transform/transition），替换现 `showExpand` 的 `display:flex` 硬切。展开的缩略图按该卷 per-roll 画幅比例（不再硬编码 3:2）。

---

## 阶段 1 — 画幅 per-roll 数据迁移（地基，最先 merge）

1. `Roll`（`types.ts:12`）加字段 `filmIdx: number`（画幅规格索引，对应 `core.ts` `films` 数组）。加向后兼容读取器 `rollFilmIdx(roll)`（旧卷/缺字段 → 默认 1=135），与现有 `rollFilmType` 同模式。
2. `pieceLayout`（`render.ts:57`）改：`ratio/aspect` 从 `films[filmIdx]` 改读 `films[rollFilmIdx(roll)]`（`roll` 已在函数内取到）。删除对全局 `filmIdx` 的依赖。
3. `newRoll`（`rolls.ts:9`）建卷时写入 `filmIdx`（默认 1，阶段 2 由弹窗传入）。
4. **移除全局画幅 UI**：
   - `index.html` 删 `#films`（底部 dock chips 容器）与抽屉「画幅规格」`<label>`+`#filmSeg`。
   - `main.ts:18-31` 删 `films.forEach` 建 chip/seg 的整段；删 `selectFilm` 的 import 与 `presets.ts` 的 `selectFilm`、`state.ts` 的 `filmIdx`/`setFilmIdx`/相关导出。
   - 切某卷画幅改走 per-roll 重渲：复用 `rerenderPiecesByRoll(roll.id)`（阶段 2 弹窗保存时调用）。
5. `persist.ts`：卷入库/出库带上 `filmIdx`（与 `filmType` 并列存取）；`loadAllRolls` 恢复时回填（缺则默认 1）。
6. selftest 适配：`selftest.ts` 的 `newRoll()` 调用不传画幅 → 默认 135，断言不依赖具体画幅值（行 28-30 用 `deckScale`、行 45-53 只验像素存在），应自然通过；但**移除 `#films`/`#filmSeg` 后确认 `main.ts`/`presets.ts` 无残留 `$('#films')` 抛错**。

验收：画幅成为 per-roll 字段；不同卷可不同画幅、各自的 piece 按本卷画幅渲染；底部/抽屉再无全局画幅控件；旧持久化卷恢复后默认 135 正常；`?selftest` PASS。

## 阶段 2 — 新建/编辑卷弹窗（modal：画幅 + 类型 + 张数上限）

1. `index.html` 新增 modal（如 `#rollModal`，含遮罩 scrim）：画幅规格选择（4 档，复用 `films` 的 name/desc）、胶片类型三选一（复用 `FILM_TYPES`）、张数上限输入（预设 12/24/36 + 自定义数字）。底部「确定/取消」。`styles.css` 加 modal 样式（暗色、居中、遮罩），**不引入 UI 框架**。
2. `Roll` 加字段 `cap?: number`（张数上限，阶段 3 执行）。
3. `rolls.ts`：`newRoll` 扩参为 `newRoll(opts?)`（`{ filmType, filmIdx, cap }`），**保持旧签名 `newRoll('reversal')` 等位置参兼容**（selftest 在用），缺省同现状。新增 `updateRollSettings(roll, opts)`：改 `filmType/filmIdx/cap` 后 `rerenderPiecesByRoll` + `renderTray` + `persistRoll`。
4. `main.ts` 接线：
   - 「＋新建卷」(`#newRoll`) 打开 modal（建卷模式）；确定 → `newRoll(opts)`。删除旧 `#newRollPanel` 及其 `click` 监听（`main.ts:35-41`）。
   - 卷头新增"设置/编辑"入口（如卷头齿轮按钮或双击卷卡片），打开 modal（编辑模式，预填当前值）；确定 → `updateRollSettings`。事件并入 `rollsEl` 的 click 委托（`main.ts:64`，与 `.roll-del`/`.roll-add`/`.roll-type` 并列，注意在 `pointerdown` 起拖判断里加入排除，见 `main.ts:52`）。
   - `#placeholder` 引导建卷（`main.ts:43`）改为打开 modal 或带默认 opts 的 `newRoll()`，保持"新建并导入"语义。
5. `persist.ts` 带上 `cap` 存取（向后兼容缺省）。
6. selftest：弹窗为纯 DOM，selftest 不经 modal、直接调 `newRoll(...)`/`updateRollSettings`；确认 `newRoll` 旧位置参签名未破。

验收：点「＋新建卷」弹出 modal，可选画幅/类型/张数并建卷；卷头设置入口可重开 modal 编辑同卷属性，保存后该卷 piece 实时按新画幅/类型重渲并落库；旧 `#newRollPanel` 已移除；`?selftest` PASS。

## 阶段 3 — 硬张数上限执行

1. `rolls.ts` `addFiles`（`rolls.ts:52`）：导入前按目标卷 `cap`（向后兼容：无 cap → 不限）计算剩余配额 `cap - shots.length`；超出部分**截断不导入**，并提示（如顶部 toast 或卷头闪烁 + 文案"卷已满 N 张"）。旧卷无 cap 不受限。
2. 容量显示：卷头计数（`tray.ts:112` 的 `roll-count`）由「N 张」改「N/cap 张」（无 cap 时仍「N 张」）；满卷视觉标记（如计数变红）。弹窗编辑里若把 cap 调到低于现有张数，给出提示策略（拒绝下调 or 仅警告不删帧——**默认仅警告、不自动删帧**）。
3. 拖照片进卷（`moveShot`/外部文件 drop，`main.ts:88-95`/`rolls.ts:39`）同样受 cap 约束。
4. 确定性：提示路径不依赖随机，`?selftest` 可复现。

验收：卷满后继续导入/拖入被拒并提示，卷内张数不超 cap；卷头显示 N/cap 且满卷有标记；旧无 cap 卷不受限；`?selftest` PASS。

## 阶段 4 — 右侧候选区平视：35mm 胶卷暗盒（竖立金属罐）

1. 替换 `drawCoil`（`tray.ts:9`，俯视同心盘）为 `drawCanister`：纯 Canvas 画**竖立的 35mm 暗盒**——金属罐身（圆柱，竖直渐变高光模拟金属）、顶部轴心凸起、底部露一截片头（leader，带齿孔边）。零图片资源、零依赖。罐身可印卷名/类型字样或留给 DOM meta。
2. `renderTray`（`tray.ts:96`）卡片布局调整：从"小盘 + 横排 meta"改为暗盒竖立形态，卷名/计数/类型/设置/删除按钮随新布局重排。`styles.css` 的 `.roll`/`.coil`/`.roll-meta`/`.roll-btns` 相应改写（canvas 尺寸常量 `size=56` 按罐比例调整）。
3. 暗盒外观对三种 `filmType` 可做色彩区分（可选，协调即可），罐底片头颜色随卷画幅/类型。
4. 不破现有交互：卡片任意处 `pointerdown` 仍抓整卷拖台面（`main.ts:48`）、`.roll-del`/`.roll-add`/`.roll-type`/设置入口的 click 优先不起拖。

验收：右侧每卷显示为竖立的金属暗盒（平视立体感，非俯视盘），底部露片头；卷名/计数/类型/按钮排布正常；拖整卷/删卷/导入/切类型/打开设置全部照旧可用。

## 阶段 5 — hover 卷轴展开动画（从暗盒抽出胶片）

1. `showExpand`/`hideExpand`（`tray.ts:63-88`）的 `display:flex` 硬切改为**卷轴抽片动画**：hover 卷 → 胶片条从暗盒罐口方向"抽出/拉开"（CSS `transform`（translate/scaleX）+ `transition`，或逐帧入场的级联 transition）。收起时反向卷回。保留 120ms 延迟收起逻辑（`scheduleHideExpand`，`tray.ts:89`）与"指针移进展开条不收起"（`main.ts:122`）。
2. 展开缩略图 `drawFrameThumb`（`tray.ts:41`）改：画幅比例从硬编码 `3/2` 改读该卷 per-roll 画幅（`films[rollFilmIdx(roll)].aspect`），即缩略图比例与卷一致。
3. 动画方向与阶段 4 暗盒形态一致（从罐口/片头方向抽出），视觉连贯。
4. 确定性：动画为 CSS 驱动、不阻塞断言；`showExpand` 仍同步把缩略图 DOM 建好（selftest 若检查展开内容，结构不变）。空卷仍显示「空卷 · 点 ＋ 导入照片」。

验收：hover 卷时胶片条带卷轴抽出动画展开、移开反向收起；缩略图按本卷画幅比例；延迟收起/移进不收起照旧；`?selftest` PASS。

---

## 给 ginger 的调度提示

- 顺序 **1→2→3→4→5 严格串行**，各一条、各独立 PR。1→2→3 同改数据链（`types.ts`/`rolls.ts`/`persist.ts`/`index.html`/`main.ts`），4→5 同改 `tray.ts`+`styles.css`，串行避免合并冲突。
- **阶段 1 是地基，必须最先 merge**（画幅 per-roll 是 2/4/5 的前提）。
- 全部在 `FILM_LOOK_SPEC` **之前**完成。`FILM_LOOK_SPEC` 阶段 3 也改 `pieceLayout` 的边距 `m`，本 spec 阶段 1 先把 `pieceLayout` 的画幅来源改成 per-roll，地基定下后 `FILM_LOOK` 更顺。
- 每阶段验收都跑 `npm run selftest:headless`（退出码 0=PASS）。移除全局画幅 UI（阶段 1）后尤其确认无残留 `$('#films')`/`$('#filmSeg')` 抛错。
- 收尾同步仓库 `CLAUDE.md` 架构地图反查表里「画幅/规格」「新建卷流程/弹窗」「右侧候选区外观/动画」三行（画幅已 per-roll、弹窗即设置、暗盒+卷轴动画）。
