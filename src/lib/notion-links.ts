/**
 * Build-time rewrite of Notion page mentions / cross-links in rendered HTML.
 *
 * Upstream loader emits Notion app URLs (often with plain_text "Untitled").
 * We map published pages to /blog/{slug}, fill real titles, and unwrap
 * unpublished mentions so the public site never points at private Notion.
 */
import { Client, isFullPage } from '@notionhq/client'

export type PublishedNotionPage = {
  pageId: string
  slug: string
  title: string
}

const ANCHOR_RE =
  /<a\b([^>]*?)\bhref\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi

/** Match Notion page URLs: /p/{id}, /{uuid}, /Title-{32hex} */
const NOTION_PAGE_ID_PATTERNS: RegExp[] = [
  /https?:\/\/(?:www\.|app\.)?notion\.(?:so|com)\/p\/([0-9a-fA-F-]{32,36})(?:[?#]|$)/i,
  /https?:\/\/(?:www\.|app\.)?notion\.(?:so|com)\/([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})(?:[?#]|$)/i,
  /https?:\/\/(?:www\.|app\.)?notion\.(?:so|com)\/(?:[^/?#]*-)?([0-9a-fA-F]{32})(?:[?#]|$)/i
]

export function normalizeNotionPageId(id: string): string {
  return id.replace(/-/g, '').toLowerCase()
}

export function extractNotionPageIdFromHref(href: string): string | null {
  const raw = href.trim()
  for (const re of NOTION_PAGE_ID_PATTERNS) {
    const m = raw.match(re)
    if (m?.[1]) {
      const id = normalizeNotionPageId(m[1])
      if (/^[0-9a-f]{32}$/.test(id)) return id
    }
  }
  return null
}

function isUselessLinkText(text: string): boolean {
  const t = text.replace(/<[^>]+>/g, '').trim()
  return !t || /^untitled$/i.test(t) || /^无$/i.test(t)
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pageTitleFromNotionPage(page: {
  properties: Record<string, { type?: string; title?: Array<{ plain_text?: string }> }>
}): string {
  for (const prop of Object.values(page.properties)) {
    if (prop?.type === 'title') {
      const t = (prop.title ?? []).map((x) => x.plain_text ?? '').join('').trim()
      if (t) return t
    }
  }
  return ''
}

export function createNotionTitleFetcher(auth: string) {
  const client = new Client({ auth })
  const cache = new Map<string, string>()

  return async function fetchTitle(pageIdNorm: string): Promise<string> {
    if (cache.has(pageIdNorm)) return cache.get(pageIdNorm)!
    // Notion API accepts dashed or undashed ids
    const dashed =
      pageIdNorm.length === 32
        ? `${pageIdNorm.slice(0, 8)}-${pageIdNorm.slice(8, 12)}-${pageIdNorm.slice(12, 16)}-${pageIdNorm.slice(16, 20)}-${pageIdNorm.slice(20)}`
        : pageIdNorm
    try {
      const page = await client.pages.retrieve({ page_id: dashed })
      let title = ''
      if (isFullPage(page)) title = pageTitleFromNotionPage(page)
      cache.set(pageIdNorm, title)
      return title
    } catch {
      cache.set(pageIdNorm, '')
      return ''
    }
  }
}

export async function rewriteNotionPageLinks(
  html: string,
  publishedById: Map<string, PublishedNotionPage>,
  fetchTitle: (pageIdNorm: string) => Promise<string>
): Promise<{ html: string; rewritten: number }> {
  if (!html || !html.includes('notion.')) {
    return { html, rewritten: 0 }
  }

  const matches = [...html.matchAll(ANCHOR_RE)]
  if (matches.length === 0) return { html, rewritten: 0 }

  let rewritten = 0
  let out = ''
  let last = 0

  for (const m of matches) {
    const full = m[0]
    const index = m.index ?? 0
    const href = m[3]
    const inner = m[5]
    const pageId = extractNotionPageIdFromHref(href)
    if (!pageId) continue

    out += html.slice(last, index)
    last = index + full.length

    const published = publishedById.get(pageId)
    const innerText = inner.replace(/<[^>]+>/g, '').trim()
    const fetched =
      published?.title ||
      (!isUselessLinkText(innerText) ? innerText : '') ||
      (await fetchTitle(pageId))
    const title = (fetched || '').trim()

    if (published?.slug) {
      out += `<a href="/blog/${escapeHtml(published.slug)}" class="notion-internal-ref">${escapeHtml(title || published.slug)}</a>`
    } else if (title) {
      // Unpublished but we have a title: keep text, drop private Notion URL
      out += `<span class="notion-page-ref" data-notion-page="${pageId}">${escapeHtml(title)}</span>`
    } else {
      // No access / Untitled: drop the dead mention (list label before it remains)
      out += ''
    }
    rewritten++
  }

  out += html.slice(last)
  return { html: out, rewritten }
}

export function buildPublishedMap(
  entries: Iterable<{ pageId: string; slug: string; title: string }>
): Map<string, PublishedNotionPage> {
  const map = new Map<string, PublishedNotionPage>()
  for (const e of entries) {
    const id = normalizeNotionPageId(e.pageId)
    if (!id || !e.slug) continue
    map.set(id, { pageId: id, slug: e.slug, title: e.title || e.slug })
  }
  return map
}
