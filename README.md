# 观片台 · FilmScan Lightbox

把底片放上一台**发光的实体观片台**翻拍 —— 不是 Photoshop 式的工具面板,而是一个沉浸场景:照片平躺在发光台面上,放在深色桌面上。

**左右滑动切换不同观片台**(专业台 / iPad / 手机 / 暖光老灯箱),桌面不动、台子滑来滑去,每台对应一组色温/透光/均匀度/机身外框/像素纹理。需要精修时再拉出「微调」抽屉。

全免费、纯前端、不上传服务器(照片只在你浏览器本地处理)。

## 功能

- 拖拽 / 点击把照片放上台面(JPG / PNG)
- **四台可切换观片台**:箭头 / 底部圆点 / 键盘 ← → / 触摸滑动
  - **专业观片台** — 中性纯白、大面积均匀、塑料宽边
  - **iPad** — 冷白、铝边大圆角、极淡像素网格
  - **手机** — 亮冷白、窄黑边、像素网格略强
  - **暖光老灯箱** — 暖白、中心亮四周暗的灯箱热点
- 「微调」抽屉:白边粗细 / 边缘透光感 / **均匀度热点** / **像素网格** / 圆角 / 底色色温
- 导出**原图分辨率**的干净灯箱白边图(含色温/透光/均匀度/像素,不含机身外框)

## Quick Start

```bash
npm install && npm run dev   # → http://localhost:5173
```

浏览器会自动加载,拖照片进卷、把卷拖上台面即可。脚本一览:

- `npm run dev` — 开发服务器(HMR,默认 5173)
- `npm run build` — 产出静态 `dist/`(可直接托管)
- `npm run preview` — 本地预览 `dist/` 产物(默认 4173)
- `npm run selftest:headless` — 无头 Chrome 一键跑页内自检,判 PASS/FAIL

## 技术

原生 **TypeScript + Vite** + Canvas,**运行时零 UI 框架**、无后端。`npm run build` 出静态 `dist/`,可白嫖部署到 GitHub Pages / Vercel(GitHub Pages 子路径部署见 `CLAUDE.md`「部署」)。

## 开发 / 自检

本仓库现为 Vite + TypeScript(`npm install` 后):

- `npm run dev` — 开发服务器(默认 `http://localhost:5173`)
- `npm run build` — 产出 `dist/`(静态产物)
- `npm run preview` — 在本地预览 build 产物(默认 `http://localhost:4173`)
- `npx tsc --noEmit` — 类型检查

### 页内自检(`?selftest`)

任一模式下,在 URL 后加 `?selftest` 会动态 import `src/selftest.ts` 跑断言,
右下角浮层显示 `SELFTEST PASS`(绿)/ `SELFTEST FAIL`(红):

- dev:`http://localhost:5173/?selftest`
- preview(build 产物):`http://localhost:4173/?selftest`

> ESM 动态 `import('./selftest')` 由 Vite 打成独立带 hash 的 chunk,主 chunk 已正确引用,
> dev 与 build 产物路径均自动正确,无需手工处理 chunk 路径。

### 无头自检(一键)

```bash
npm run selftest:headless
```

脚本 `scripts/selftest-headless.sh` 会:`npm run build` → 后台起 `vite preview`(端口 4173)
→ 无头 Chrome(`--headless --disable-gpu --virtual-time-budget=3000 --dump-dom`)访问
`http://localhost:4173/?selftest` → grep 浮层文本含 `SELFTEST PASS` → 杀掉 preview →
退出码 `0`(PASS)/ `1`(FAIL)。可用 `CHROME=/path/to/chrome` 指定浏览器、`SELFTEST_PORT=xxxx` 改端口。

**若 CI 路径上没有无头 Chrome**,手动等价步骤:

```bash
npm run build && npm run preview
# 浏览器打开 http://localhost:4173/?selftest,看右下角浮层是否 SELFTEST PASS
```

## License

MIT
