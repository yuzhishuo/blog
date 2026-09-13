/**
 * Formal Notion content loading (Astro Content Layer — not MCP sync).
 *
 * Database: 2570b37ec46a4bf39795c1bbb6a66d8d
 * Data source: a1a3b01e-711c-42fb-b3c1-c05b796fccfe
 * Filter: Status (select) = 已发布
 *
 * Without NOTION_TOKEN the loader no-ops (empty collection) so local builds work.
 */
import { fileURLToPath } from 'node:url'

import { notionLoader } from '@luanroger/notion-astro-loader'
import type { Loader, LoaderContext, ParseDataOptions } from 'astro/loaders'
import { loadEnv } from 'vite'

import {
  buildPublishedMap,
  createNotionTitleFetcher,
  normalizeNotionPageId,
  rewriteNotionPageLinks
} from './notion-links'

export const NOTION_DATABASE_ID = '2570b37ec46a4bf39795c1bbb6a66d8d'
export const NOTION_DATA_SOURCE_ID = 'a1a3b01e-711c-42fb-b3c1-c05b796fccfe'

/** Status is a SELECT property — must use `select`, not `status`. */
export const notionPublishedFilter = {
  property: 'Status',
  select: { equals: '已发布' }
} as const

export const notionEnvKeys = [
  'NOTION_TOKEN',
  'NOTION_DATABASE_ID',
  'NOTION_DATA_SOURCE_ID'
] as const

/** Project root (src/lib → ../..). Used so content config can read `.env` at build time. */
const projectRoot = fileURLToPath(new URL('../..', import.meta.url))

let dotenvCache: Record<string, string> | null = null

/** Load all keys from project `.env*` via Vite (does not log values). */
function loadProjectEnv(): Record<string, string> {
  if (dotenvCache) return dotenvCache
  try {
    const mode =
      typeof process !== 'undefined' && process.env.NODE_ENV
        ? process.env.NODE_ENV
        : 'development'
    // Empty prefix → load NOTION_* (not only VITE_/PUBLIC_)
    dotenvCache = loadEnv(mode, projectRoot, '')
  } catch {
    dotenvCache = {}
  }
  return dotenvCache
}

function readEnv(key: string): string | undefined {
  const fromProcess =
    typeof process !== 'undefined' ? process.env[key]?.trim() : undefined
  if (fromProcess) return fromProcess

  const fromFile = loadProjectEnv()[key]?.trim()
  if (fromFile) {
    // Mirror into process.env for later readers in the same build
    if (typeof process !== 'undefined') process.env[key] = fromFile
    return fromFile
  }

  try {
    const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string> }).env
    const v = viteEnv?.[key]
    return typeof v === 'string' && v.trim() ? v.trim() : undefined
  } catch {
    return undefined
  }
}

export function getNotionToken(): string | undefined {
  return readEnv('NOTION_TOKEN')
}

export function getNotionDataSourceId(): string {
  return readEnv('NOTION_DATA_SOURCE_ID') || NOTION_DATA_SOURCE_ID
}

export function hasNotionCredentials(): boolean {
  return Boolean(getNotionToken())
}

type NotionProp = {
  type?: string
  title?: Array<{ plain_text?: string }>
  rich_text?: Array<{ plain_text?: string }>
  select?: { name?: string } | null
  multi_select?: Array<{ name?: string }>
  date?: { start?: string | null } | null
  checkbox?: boolean
}

function plainFromRichText(items: Array<{ plain_text?: string }> | undefined): string {
  return (items ?? []).map((t) => t.plain_text ?? '').join('').trim()
}

function readProp(
  properties: Record<string, NotionProp> | undefined,
  name: string
): NotionProp | undefined {
  return properties?.[name]
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1).trimEnd() + '…'
}

/** Map raw Notion page data → Theme Pure blog schema fields. */
export function mapNotionPageToBlogData(raw: {
  properties?: Record<string, NotionProp>
  [key: string]: unknown
}): {
  title: string
  description: string
  publishDate: Date
  tags: string[]
  draft: boolean
  comment: boolean
  slug: string
} {
  const props = raw.properties ?? {}
  const name = readProp(props, 'Name')
  const summary = readProp(props, 'Summary')
  const slugProp = readProp(props, 'Slug')
  const tagsProp = readProp(props, 'Tags')
  const dateProp = readProp(props, 'PublishDate')

  const title =
    name?.type === 'title'
      ? plainFromRichText(name.title)
      : plainFromRichText(name?.title) || 'Untitled'

  const description =
    summary?.type === 'rich_text'
      ? plainFromRichText(summary.rich_text)
      : plainFromRichText(summary?.rich_text) || ''

  const slug =
    slugProp?.type === 'rich_text'
      ? plainFromRichText(slugProp.rich_text)
      : plainFromRichText(slugProp?.rich_text) || ''

  const tags =
    tagsProp?.type === 'multi_select'
      ? (tagsProp.multi_select ?? []).map((o) => (o.name ?? '').toLowerCase()).filter(Boolean)
      : []

  const publishStart = dateProp?.date?.start
  const publishDate = publishStart ? new Date(publishStart) : new Date()

  return {
    title: truncate(title || 'Untitled', 60),
    description: truncate(description || title || 'Notion post', 160),
    publishDate,
    tags,
    draft: false, // filtered to 已发布
    comment: true,
    slug: slug || ''
  }
}

function emptyNotionLoader(): Loader {
  return {
    name: 'notion-blog-empty',
    load: async ({ logger }: LoaderContext) => {
      logger.info('NOTION_TOKEN unset — Notion blog collection left empty (local markdown only)')
    }
  }
}

type RenderedEntry = {
  html?: string
  metadata?: Record<string, unknown>
}

/**
 * Notion → blog collection loader.
 * Remaps Notion properties to the Pure blog schema and uses Slug as entry id.
 * After render, rewrites Notion page mention links for the public site.
 */
export function createNotionBlogLoader(): Loader {
  const token = getNotionToken()
  if (!token) return emptyNotionLoader()

  const dataSourceId = getNotionDataSourceId()
  const base = notionLoader({
    auth: token,
    dataSourceId,
    filter: notionPublishedFilter,
    collectionName: 'notionBlog',
    imageSavePath: 'assets/images/notion'
  })

  return {
    name: 'notion-blog',
    async load(context: LoaderContext) {
      // Always refresh Notion at build. The upstream loader skips pages when
      // store digest === last_edited_time; CI / build:ci must not reuse stale entries.
      context.store.clear()
      context.logger.info('Notion store cleared — full refresh (no stale skip)')

      const originalParseData = context.parseData.bind(context)
      const originalSet = context.store.set.bind(context.store)

      // Original Notion page id (before slug remapping) for each slug entry
      const notionPageIdBySlug = new Map<string, string>()

      // parseData is a generic method on LoaderContext — assign through a narrow cast
      const parseDataOverride = async (
        args: ParseDataOptions<Record<string, unknown>>
      ): Promise<Record<string, unknown>> => {
        const mapped = mapNotionPageToBlogData(
          (args.data ?? {}) as { properties?: Record<string, NotionProp> }
        )
        const id = mapped.slug || args.id
        if (mapped.slug && args.id) {
          notionPageIdBySlug.set(mapped.slug, normalizeNotionPageId(String(args.id)))
        }
        return originalParseData({
          id,
          data: {
            title: mapped.title,
            description: mapped.description,
            publishDate: mapped.publishDate,
            tags: mapped.tags,
            draft: mapped.draft,
            comment: mapped.comment,
            slug: mapped.slug || id
          }
        }) as Promise<Record<string, unknown>>
      }
      ;(context as unknown as { parseData: typeof parseDataOverride }).parseData =
        parseDataOverride

      context.store.set = (entry) => {
        const data = entry.data as { slug?: string }
        const slug = typeof data.slug === 'string' ? data.slug.trim() : ''
        const id = slug || entry.id
        // Upstream passes Notion page UUID as entry.id before we remap to slug
        if (entry.id) {
          notionPageIdBySlug.set(id, normalizeNotionPageId(String(entry.id)))
        }
        return originalSet({ ...entry, id })
      }

      await base.load(context)

      // --- Automate mention / cross-page link rewrite ---
      const published = buildPublishedMap(
        [...context.store.keys()].map((key) => {
          const entry = context.store.get(key)
          const data = (entry?.data ?? {}) as { slug?: string; title?: string }
          const slug = (data.slug || key).trim()
          const pageId =
            notionPageIdBySlug.get(slug) ||
            notionPageIdBySlug.get(key) ||
            normalizeNotionPageId(key)
          return {
            pageId,
            slug,
            title: typeof data.title === 'string' ? data.title : slug
          }
        })
      )

      const fetchTitle = createNotionTitleFetcher(token)
      let totalRewrites = 0

      for (const key of context.store.keys()) {
        const entry = context.store.get(key)
        if (!entry?.rendered) continue
        const rendered = entry.rendered as RenderedEntry
        if (typeof rendered.html !== 'string' || !rendered.html.includes('notion.')) {
          continue
        }

        const { html, rewritten } = await rewriteNotionPageLinks(
          rendered.html,
          published,
          fetchTitle
        )
        if (rewritten === 0) continue

        totalRewrites += rewritten
        // Astro skips set() when digest is unchanged — bump it so rewritten HTML sticks.
        const prevDigest = typeof entry.digest === 'string' ? entry.digest : ''
        originalSet({
          id: entry.id,
          data: entry.data,
          body: entry.body,
          filePath: entry.filePath,
          assetImports: entry.assetImports,
          digest: `${prevDigest}:notion-links`,
          rendered: { ...rendered, html }
        })
      }

      if (totalRewrites > 0) {
        context.logger.info(
          `Rewrote ${totalRewrites} Notion page mention(s) → blog links / plain titles`
        )
      } else {
        context.logger.info('No Notion page mentions needed rewrite')
      }
    }
  }
}
