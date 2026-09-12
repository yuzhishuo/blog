# Setup / 配置说明

English + 中文. Project scaffold: **Astro Theme Pure** for user **Yi min Liu / yuzhishuo**.

## Persistence note / 持久化说明

This project lives on the **agent box** at `/workspace/pure-blog`. The box filesystem persists across agent turns, but it is **not** your laptop and **not** GitHub until you push.

**Dual-repo layout**

| Role | Repo | Purpose |
|------|------|---------|
| Source | [`yuzhishuo/blog`](https://github.com/yuzhishuo/blog) | Astro source + CI (this tree) |
| Product | [`yuzhishuo/yuzhishuo.github.io`](https://github.com/yuzhishuo/yuzhishuo.github.io) | Static `dist` on `main` root → user site |
| Site | https://yuzhishuo.github.io | GitHub Pages from product repo |

When you have GitHub auth:

1. Repo already `git init`'d on this box with `origin` → `https://github.com/yuzhishuo/blog.git`
2. Commit & `git push -u origin main` to **source** (never commit `.env`)
3. **Product** Pages: Settings → Pages → Deploy from a branch → `main` / `/` (root)
4. **Source** Actions secrets:
   - `NOTION_TOKEN` — Notion Internal Integration secret
   - `PAGES_DEPLOY_TOKEN` — PAT with write access to `yuzhishuo/yuzhishuo.github.io`
   - Optional secrets: `NOTION_DATABASE_ID`, `NOTION_DATA_SOURCE_ID`; Actions variable `DOUBAN_USER_ID`
5. CI builds on push to `main`, cron `*/15`, or `workflow_dispatch`, then deploys `dist` to the product repo

Do **not** commit `.env` (real tokens). Use `.env.example` as the template.

---

## Local run / 本地运行

**Requires Node.js ≥ 22.12** (Astro 6). On this box: `source ~/.nvm/nvm.sh && nvm use 22` (and `unset NPM_CONFIG_PREFIX` if needed).


```bash
cd /workspace/pure-blog
npm install
npm run build:ci     # works WITHOUT NOTION_TOKEN (Notion source no-ops)
npm run dev          # http://localhost:4321
npm run preview      # preview static build
```

Site placeholders:

- `site`: `https://yuzhishuo.github.io` (`astro.config.ts` + `src/site.config.ts`)
- Title: **博客** · Author: **Yi min Liu**
- Prefer **user Pages** (no `base`). Project Pages (`/repo-name/`) need careful base-path edits (theme discourages this).

---

## RSS

Feed is enabled via `src/pages/rss.xml.ts` (`@astrojs/rss`).

- **Path:** `/rss.xml`
- Full URL (after deploy): `https://yuzhishuo.github.io/rss.xml`
- Linked in the footer social icons.
- Items include **local markdown + Notion** posts when `NOTION_TOKEN` is set.

---

## Giscus (stubbed) / 评论占位

Waline is **disabled**. Giscus is wired in layouts but **not live** until you fill IDs.

1. Enable **Discussions** on the GitHub repo
2. Open [giscus.app](https://giscus.app) → copy `repo`, `repoId`, `category`, `categoryId`
3. Edit `giscus` in `src/site.config.ts` (or set `PUBLIC_GISCUS_*` in `.env`) and set `enable: true`
4. Component: `src/components/giscus/Giscus.astro` · helper: `src/config/giscus.ts`

Until configured, posts show a dashed “stubbed” notice instead of the widget.

---

## Dual-source content / 双源内容

| Source | Status |
|--------|--------|
| Local Markdown/MDX in `src/content/blog/` | **Active** |
| Notion collection `notionBlog` (DB `2570b37ec46a4bf39795c1bbb6a66d8d` / data source `a1a3b01e-711c-42fb-b3c1-c05b796fccfe`) | **Active when `NOTION_TOKEN` set**; empty no-op otherwise |

**Package:** `@luanroger/notion-astro-loader` (data source API, installs cleanly with Astro 6.2).

**Filter (exact):** `{ property: 'Status', select: { equals: '已发布' } }`  
Status is a **SELECT** (options: 草稿 / 已发布 / 下架) — do **not** use a `status` filter.

**Property → blog schema map:**

| Notion | Blog field |
|--------|------------|
| Name (title) | `title` |
| Summary (text) | `description` |
| PublishDate (date) | `publishDate` |
| Tags (multi_select) | `tags` |
| Slug (text) | entry `id` (+ optional `slug`) |
| Status = 已发布 | `draft: false` |

**Listings merge:** `src/lib/posts.ts` → `getAllBlogPosts()` concatenates `blog` + `notionBlog`. Used by home, `/blog`, archives, tags, RSS, and post routes.

### Notion → publish flow

1. In Notion, set page **Status** → **已发布**
2. GitHub Actions builds on push, **every 15 minutes**, or `workflow_dispatch`
3. Loader pulls published pages at build time → static HTML on Pages
4. RSS regenerates from merged listings; Giscus comments attach by pathname

---

## Notion Integration 正式步骤（中文）

正式接入（**不是** MCP 同步）：用 Notion **Internal Integration** 在构建时拉取数据库。

1. 打开 [https://www.notion.so/my-integrations](https://www.notion.so/my-integrations) → **New integration**  
   - 类型选 Internal  
   - 关联你的 workspace  
   - 创建后复制 **Internal Integration Secret**（形如 `ntn_…` / `secret_…`）→ 这就是 `NOTION_TOKEN`
2. 打开博客数据库（ID: `2570b37ec46a4bf39795c1bbb6a66d8d`）→ 右上角 **···** → **Connections** / **连接** → 添加刚创建的 Integration（必须分享，否则 API 读不到）
3. 确认属性：`Name`(title)、`Status`(select: 草稿/已发布/下架)、`Slug`(text)、`Summary`(text)、`Tags`(multi_select)、`PublishDate`(date)、`Synced`(checkbox)
4. 本地：复制 `.env.example` → `.env`，只填入你自己的 token（**不要提交 `.env`，也不要让人替你编造 token**）:

```bash
cp .env.example .env
# 编辑 .env：
# NOTION_TOKEN=你的_Internal_Integration_Secret
# NOTION_DATABASE_ID=2570b37ec46a4bf39795c1bbb6a66d8d
# NOTION_DATA_SOURCE_ID=a1a3b01e-711c-42fb-b3c1-c05b796fccfe
```

5. GitHub **源仓** `yuzhishuo/blog`：**Settings → Secrets and variables → Actions** 添加 `NOTION_TOKEN`、`PAGES_DEPLOY_TOKEN`（可选覆盖 `NOTION_DATABASE_ID` / `NOTION_DATA_SOURCE_ID`；变量 `DOUBAN_USER_ID`）
6. 未设置 token 时：`notionBlog` 集合为空，**仅本地 Markdown 构建**，`npm run build:ci` 仍应成功

代码入口：

- `src/lib/notion.ts` — loader、select 过滤、属性映射  
- `src/content.config.ts` — `blog` + `notionBlog` + `docs`  
- `src/lib/posts.ts` — 列表合并  

---

## GitHub Actions → dual-repo Pages

Workflow: `.github/workflows/deploy-pages.yml` (runs in **source** `yuzhishuo/blog`)

- Triggers: `push` to `main`, **cron `*/15 * * * *`**, `workflow_dispatch`
- Build: Node 22 · `npm run build:ci` · `NOTION_TOKEN` + Notion IDs + `DOUBAN_USER_ID` var
- Deploy: `peaceiris/actions-gh-pages@v4` → `external_repository: yuzhishuo/yuzhishuo.github.io`, `publish_dir: dist`, `publish_branch: main`, `force_orphan: true`
- Secrets on **source**: `NOTION_TOKEN`, `PAGES_DEPLOY_TOKEN` (PAT that can push to product)
- **Product** Pages: branch `main` / root (not `actions/deploy-pages` / GitHub Actions source)

---

## Douban shelf / 豆瓣书影音（看过 · 玩过 · 听过）

Build-time fetch of Douban **done** shelves (电影看过 / 游戏玩过 / 音乐听过) via the public **Frodo** mobile API (`frodo.douban.com`). No login cookies. HTML/RSS scrape is blocked from this environment; Frodo + HMAC-SHA1 works.

| Item | Value |
|------|--------|
| Profile | https://www.douban.com/people/153627368/ |
| Display name | 小新一点 |
| User id env | `DOUBAN_USER_ID` (default `153627368`) |
| Cache | `src/data/douban.json` (git-friendly; commit after refresh) |
| Script | `scripts/fetch-douban.mjs` → `npm run douban` |
| Homepage | Section「看过 · 玩过 · 听过」on `src/pages/index.astro` |

```bash
# Refresh cache (soft-fail: keeps existing JSON on API errors, exit 0)
npm run douban

# Optional override
DOUBAN_USER_ID=153627368 npm run douban

# Full build runs douban then astro build
npm run build
# CI: npm run build:ci  (also runs douban first)
```

**Notes**

- Categories: movie / music / game only (no books unless you extend the script).
- Status: `done` only (not wish / doing).
- Failure mode: if live fetch fails, existing `douban.json` is kept so Pages CI does not break.
- Cover images use `referrerpolicy="no-referrer"` against Douban CDN hotlink rules.
- Re-run `npm run douban` locally or in CI to refresh; cron deploy already re-fetches each build.


## 中文摘要

- 项目路径：`/workspace/pure-blog`（agent 盒子上持久，需你自行 push 到 GitHub）
- 本地：`npm i && npm run build:ci`（无 token 可构建）；开发：`npm run dev`
- RSS：`/rss.xml`（双源）
- Giscus：配置项已留空（TODO），Waline 已关
- Notion：正式 Integration 加载已接入；发布 = Status「已发布」→ Actions（含 15 分钟定时）→ Pages
- 豆瓣：`npm run douban` → `src/data/douban.json`；首页「看过 · 玩过 · 听过」；`DOUBAN_USER_ID` 默认 153627368
- 双仓：源 `yuzhishuo/blog`（CI）→ 产物 `yuzhishuo/yuzhishuo.github.io`（Pages `main` 根目录）；源仓 secrets：`NOTION_TOKEN` + `PAGES_DEPLOY_TOKEN`

---

## Defaults chosen

- Site title: **博客**
- Author: **Yi min Liu**
- Description: Engineering notes · Linux · tools
- Locale: `zh-CN`
- GitHub: `https://github.com/yuzhishuo` · Pages: `https://yuzhishuo.github.io`
- Dual-repo: source `blog` → product `yuzhishuo.github.io`
- No push performed from this scaffold.
