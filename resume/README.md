# 简历：YAML 源 + 本地 RenderCV（开源）

## 你要的形态

| 角色 | 做法 |
|------|------|
| 博客仓库 | 只存 `Liu_Yimin_CV.yaml`（+ 可选主题） |
| 本地编辑 | `docker compose -f docker-compose.resume.yml run --rm …`（Mac 装 Docker 后可自己起，不依赖助手） |
| 无 Docker 时 | 仓库根目录 `npm run resume`（需本机有 `uv`） |
| 博客展示 | `/resume` 嵌入 `public/resume.pdf` |

## 和「一模一样」

参考 PDF 来自 **BOSS 直聘**导出。开源工具**没有**直聘同款皮肤，做不到像素级一致。  
当前用 RenderCV + 中文 A4 主题按**同一信息结构**生成；要对齐版式，再改 `design:` 或 `create-theme` 自定义 Typst。

## 命令

```bash
# Docker（推荐，和助手无关）
docker compose -f docker-compose.resume.yml run --rm rendercv render Liu_Yimin_CV.yaml
docker compose -f docker-compose.resume.yml run --rm rendercv render --watch Liu_Yimin_CV.yaml

# 或
npm run resume   # 渲染并拷到 public/resume.pdf
```

产物默认在 `resume/rendercv_output/`。
