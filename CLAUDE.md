<!-- cc-auto:ops 开始 · 本段由 cc 工具链自动维护，勿手改 -->
## 🤖 运维事实（自动记录）

- 整个应用是**单文件、零依赖、零构建**：直接用浏览器打开仓库根目录的 `index.html` 即运行，无需任何安装/编译步骤。
- 无 `package.json`、无测试/构建链；改完代码做语法检查可提取 `<script>` 后 `node --check`。
- **页内自检 harness**：打开 `index.html?selftest` 自动跑断言，右下角浮层显示 `SELFTEST PASS/FAIL`（实现见 index.html 内 `selftest` 分支）。CI/无头验证可用无头 Chrome 加 `--virtual-time-budget` 推进异步后 dump DOM 读浮层背景色/文本。
- 纯前端、不上传服务器，照片只在浏览器本地处理；保持纯原生单文件、零依赖是硬约束，新增功能不要引入框架/打包器。
<!-- cc-auto:ops 结束 -->
