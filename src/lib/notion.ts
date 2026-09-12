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

/**
 * Notion → blog collection loader.
 * Remaps Notion properties to the Pure blog schema and uses Slug as entry id.
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
      const originalParseData = context.parseData.bind(context)
      const originalSet = context.store.set.bind(context.store)

      // parseData is a generic method on LoaderContext — assign through a narrow cast
      const parseDataOverride = async (
        args: ParseDataOptions<Record<string, unknown>>
      ): Promise<Record<string, unknown>> => {
        const mapped = mapNotionPageToBlogData(
          (args.data ?? {}) as { properties?: Record<string, NotionProp> }
        )
        const id = mapped.slug || args.id
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
        return originalSet({ ...entry, id })
      }

      return base.load(context)
    }
  }
}
