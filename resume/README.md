# 简历：可视化 Docker 编辑 + 博客只存 JSON

## 推荐路径（可视化）

开源服务：**[Free Resume Generator](https://github.com/alidevhere/Free-Resume-Generator)**  
镜像：`ghcr.io/alidevhere/free-resume-generator:latest`

```bash
# 博客仓库根目录（需本机 Docker Desktop）
docker compose -f docker-compose.resume.yml up -d
# 浏览器打开
open http://localhost:3099
```

- 左侧/表单编辑，右侧 **实时 PDF 预览**
- 导出 **JSON** → 覆盖仓库里的 `resume/resume.json`（博客数据源）
- 导出 **PDF** → 覆盖 `public/resume.pdf`（线上 `/resume` 展示）
- 编辑数据在 `resume/editor-data/`（本地 SQLite，已 gitignore）

停止：`docker compose -f docker-compose.resume.yml down`

## 博客展示

- 页面：`/resume`（嵌 `public/resume.pdf`）
- 提交 JSON + PDF 后 push，CI 照常发站

## 关于「和直聘一模一样」

直聘皮肤无法开源复刻。本编辑器是 FAANG/ATS 向 LaTeX 模板；结构已按你的经历填好，版式会接近专业单栏，但不是直聘像素级一致。

## 备选（无网页，只改 YAML）

```bash
docker compose -f docker-compose.resume.yml --profile cli run --rm rendercv render Liu_Yimin_CV.yaml
```
