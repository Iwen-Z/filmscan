<!-- cc-auto:ops 开始 · 本段由 cc 工具链自动维护，勿手改 -->
## 🤖 运维事实（自动记录）

- 整个应用是**单文件、零依赖、零构建**：直接用浏览器打开仓库根目录的 `index.html` 即运行，无需任何安装/编译步骤。
- 无 `package.json`、无测试/构建链；改完代码做语法检查可提取 `<script>` 后 `node --check`。
- **页内自检 harness**：打开 `index.html?selftest` 自动跑断言，右下角浮层显示 `SELFTEST PASS/FAIL`（实现见 index.html 内 `selftest` 分支）。CI/无头验证可用无头 Chrome 加 `--virtual-time-budget` 推进异步后 dump DOM 读浮层背景色/文本。
- 纯前端、不上传服务器，照片只在浏览器本地处理；保持纯原生单文件、零依赖是硬约束，新增功能不要引入框架/打包器。
<!-- cc-auto:ops 结束 -->

## 本地运行 / 导出的坑（手写，勿被 cc-auto 覆盖）

- **导出图片要用本地服务器跑，别用 `file://` 双击打开**：内置示例卷的图来自 `images/` 下的本地文件，`file://` 把每个本地文件当独立安全源 → 画布被「污染」(tainted canvas) → `toBlob` 抛 `SecurityError`、下载失败。页面一打开就 seed 了示例卷，所以 `file://` 下导出默认必废。
- 本地起服务器即可（同源、不污染、导出正常）：`cd ~/DevLab/filmscan && python3 -m http.server 8000` → 开 `http://localhost:8000`。
- 例外：**用户自己导入的照片走 `URL.createObjectURL` blob URL,同源不污染**——只导入自己的图、不碰示例卷,`file://` 下也能导出。会污染的只有 `images/` 示例图。
- 故内联示例图成 base64 能让 `file://` 也能导出,但会把照片入库+撑大单文件,与「示例照片本地不入库」的决定冲突,不采用。
