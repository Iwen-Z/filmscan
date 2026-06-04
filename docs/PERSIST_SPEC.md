# 照片持久化 spec — 导入的卷存本地,刷新不丢、不用重传

> 背景：`index.html` 单文件、原生、零依赖。当前用户导入照片走 `addFiles`(行 903)→`URL.createObjectURL(File)` 生成 **blob URL** 存进内存 `rolls[].shots[].url`,**无任何持久化**——刷新页面 blob URL 失效,卷和图全没,每次都得重传。
> 目标：把**用户导入的卷**(图的二进制 + 卷元数据)持久化到本地,下次打开自动恢复到右侧 tray。
> 约束：**纯原生、零依赖、单文件**,不引框架/打包器/库。照片只在浏览器本地,**绝不上传服务器**(持久化也只落本地 IndexedDB)。

## 关键决策(已敲定 2026-06-04)

- **存储用 IndexedDB,不用 localStorage**。localStorage 只存字符串、上限 ~5MB,照片转 base64 几张就 `QuotaExceededError`。IndexedDB 浏览器原生(零依赖)、**直接存 Blob**、容量按磁盘配额(几百 MB–GB)。
- **只持久化用户导入的卷**。内置示例卷(`seedSampleRoll` 行 1221,`roll.name='示例卷'`,shot.url 是 `images/...` 路径而非 blob)**不入库**——与 CLAUDE.md「示例照片本地不入库」一致。
- **持久化范围 = tray 里的卷**:`{id, name, filmType, shots 顺序 + 每帧 Blob}`。**piece 台面摆放不持久化**(观片台只是导出画框,重开后从 tray 重新拖即可)。
- **启动时**:库里有用户卷 → 恢复它们、**不再 seed 示例卷**;库空 → 维持现状 seed 示例卷。
- `?selftest` 分支**绝不读写库**(保持同步、断言计数不变)。

## 现状锚点(代码事实,实现时核对)

- `rolls = [{ id, name, shots:[{url,img}], filmType }]`(行 322),`nextId=1`(行 323),roll.id = `nextId++`(行 865)。
- `shot = {url, img}`,**无独立 id**;`img` 是 `Image` 对象,`url` 是 blob URL(导入)或 `images/...`(示例)。
- 导入:`addFiles(list, roll)`(行 903)——`URL.createObjectURL(f)` + `new Image()`,push 进 `roll.shots`。`f` 是 `File`(Blob 子类),**可直接存 IndexedDB**。
- 删除:`deleteRoll`(行 878)、`removeShot`(行 884) 都 `URL.revokeObjectURL`;`moveShot`(行 891) 跨卷搬 shot;`cycleRollType`(行 871) 改 `roll.filmType`。
- 示例 seed:`if(!location.search.includes('selftest')) seedSampleRoll();`(行 1236)。
- selftest:行 1239 起,同步跑断言、右下角浮层 PASS/FAIL。

## 实现要点

1. **持久层封装**(一处 IndexedDB 模块,db 名如 `filmscan`,store `rolls`,keyPath `id`):
   - `persistRoll(roll)`:把该卷 upsert 进库 `{id, name, filmType, shots:[Blob,…]}`(Blob 按帧顺序)。
   - `deleteRollFromDB(id)` / 删某帧后用 `persistRoll` 覆盖整卷即可。
   - `loadAllRolls()`:读全部 → 返回数组(异步)。
   - 全异步,`async/await` 或 promise 封装;失败 try/catch,`QuotaExceeded` 给个轻提示别崩。
2. **拿到 Blob**:`addFiles` 里 `File` 即 Blob,在 shot 上留引用(如 `shot.blob=f`)或导入后即 `persistRoll(roll)`。恢复时帧无原 File,从库读 Blob → `URL.createObjectURL(blob)` → `new Image()` 重建 `shot={url,img,blob}`。
3. **区分导入 vs 示例**:给示例卷打标记(如 `roll.sample=true`,在 `seedSampleRoll` 设),持久层**跳过 sample 卷**。或判 shot.url 不以 blob 开头。推荐显式 `sample` 标记,清晰。
4. **写时机**(任何改变持久卷的操作后调 `persistRoll`/`deleteRollFromDB`):导入 `addFiles`、`deleteRoll`、`removeShot`、`moveShot`(源卷+目标卷都更新)、`cycleRollType`(filmType 变)、改名(若有)。
5. **读时机**:启动、非 selftest。`loadAllRolls()` → 重建 `rolls`(每帧 Blob→objectURL→Image,onload 后 `rerenderPiecesByRoll`+`renderTray`)、`nextId = max(已恢复 id)+1`。**有用户卷则不 seed 示例**;库空才 `seedSampleRoll()`。异步恢复期间 tray 可先空,onload 渐次补图。
6. **selftest**:行 1239 分支不触发任何 DB 调用(本来就不 seed);可加 1 条断言"持久层函数存在且在 selftest 下未写库"(同步可测的部分),不强求测异步 DB 往返。

## 验收

- 导入几张图 → 刷新页面 → 卷和图仍在右侧 tray(无需重传)。
- 删卷/删某帧 → 刷新后不复活。
- filmType(反转/黑白/负片)持久化:切类型 → 刷新仍是该类型。
- 跨卷移动帧(moveShot)后刷新,归属正确。
- 示例卷不入库:库里有用户卷时启动**不**出现示例卷;清空库后启动才出现示例卷。
- `index.html?selftest` 仍 `SELFTEST PASS`、不写库;`node --check`(提取 `<script>`)过。
- 纯原生零依赖单文件不破;照片不出浏览器。

## 给 ginger 的调度提示

- **单 PR 规模**(一条 `dev`):新增持久层 + 改 5 处现有卷操作的写时机 + 启动恢复,集中、可一把做完。
- 与 `FILM_LOOK_SPEC.md` 阶段 1–10 **代码区域不重叠**(那些改 `renderPieceFilm` 渲染路径,本 spec 改卷数据层 + 启动),互不依赖,先后随意。
- 验证按上方验收;`?selftest` 无头跑 PASS 是底线。
