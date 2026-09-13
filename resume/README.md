# 简历数据（前端渲染 + 打印）

- **数据源**：`resume/resume.json`（改完后同步到 `src/data/resume.json`，或直接改 `src/data/resume.json`）
- **展示**：`/resume` 用 HTML 渲染（直聘风格单栏）
- **打印**：页面上「打印简历」或 Ctrl/⌘ + P —— 只打简历纸，不嵌 PDF

同步命令：

```bash
cp resume/resume.json src/data/resume.json
```

CI/`npm run build` 前建议拷一次；也可只维护 `src/data/resume.json`。
