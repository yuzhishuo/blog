import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { ResolvedInsight, ResumeInsight } from '@/lib/resume'

const cacheFile = resolve(fileURLToPath(new URL('../..', import.meta.url)), 'resume/.insights-cache.json')
const TTL_MS = 24 * 60 * 60 * 1000

type CacheEntry = {
  title: string
  extra?: string
  fetchedAt: number
}

type CacheFile = Record<string, CacheEntry>

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function readCache(): CacheFile {
  try {
    if (!existsSync(cacheFile)) return {}
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as CacheFile
  } catch {
    return {}
  }
}

function writeCache(cache: CacheFile) {
  mkdirSync(dirname(cacheFile), { recursive: true })
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2) + '\n')
}

function decodeHtml(raw: string) {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .trim()
}

function metaContent(html: string, prop: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["'][^>]*>`,
    'i'
  )
  const m = html.match(re)
  return decodeHtml(m?.[1] || m?.[2] || '')
}

function pageTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return decodeHtml(m?.[1] || '')
}

function wechatTitle(html: string) {
  const msg = html.match(/var\s+msg_title\s*=\s*(?:htmlDecode\()?['"]([^'"]+)['"]/)
  if (msg?.[1]) return decodeHtml(msg[1])
  return metaContent(html, 'og:title') || pageTitle(html)
}

function stripWechatSuffix(title: string) {
  return title.replace(/\s*[-|｜]\s*微信公众(?:平台|号)\s*$/, '').trim()
}

function formatStars(n: number) {
  if (!Number.isFinite(n) || n < 0) return ''
  if (n >= 1000) {
    const k = n / 1000
    const s = k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')
    return `${s}k☆`
  }
  return `${n}☆`
}

function githubRepo(url: URL) {
  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (parts.length < 2) return null
  if (['orgs', 'users', 'settings', 'topics', 'sponsors'].includes(parts[0])) return null
  return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') }
}

function fallbackTitle(url: string) {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last ? decodeURIComponent(last) : u.hostname
  } catch {
    return url
  }
}

function normalize(item: ResumeInsight): { url: string; title?: string; note?: string } {
  if (typeof item === 'string') return { url: item.trim() }
  return { url: item.url.trim(), title: item.title?.trim(), note: item.note?.trim() }
}

async function fetchText(url: string) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/json;q=0.9,*/*;q=0.8'
    }
  })
  if (!res.ok) throw new Error(String(res.status))
  return res
}

async function unfurl(url: string): Promise<{ title: string; extra?: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { title: url }
  }

  if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
    const repo = githubRepo(parsed)
    if (repo) {
      try {
        const res = await fetchText(`https://api.github.com/repos/${repo.owner}/${repo.repo}`)
        const data = (await res.json()) as { name?: string; stargazers_count?: number; full_name?: string }
        const extra = formatStars(Number(data.stargazers_count || 0))
        return { title: data.name || repo.repo, extra }
      } catch {
        return { title: repo.repo }
      }
    }
  }

  try {
    const res = await fetchText(url)
    const html = await res.text()
    const host = parsed.hostname
    let title =
      host.includes('mp.weixin.qq.com') ? wechatTitle(html) : metaContent(html, 'og:title') || pageTitle(html)
    title = stripWechatSuffix(title)
    if (!title) title = fallbackTitle(url)
    return { title }
  } catch {
    return { title: fallbackTitle(url) }
  }
}

export async function resolveInsights(items: ResumeInsight[] | undefined): Promise<ResolvedInsight[]> {
  if (!items?.length) return []
  const cache = readCache()
  const now = Date.now()
  let dirty = false
  const out: ResolvedInsight[] = []

  for (const raw of items) {
    const item = normalize(raw)
    if (!item.url) continue
    let title = item.title || ''
    let extra: string | undefined
    if (!title) {
      const hit = cache[item.url]
      if (hit && now - hit.fetchedAt < TTL_MS && hit.title) {
        title = hit.title
        extra = hit.extra
      } else {
        const resolved = await unfurl(item.url)
        title = resolved.title
        extra = resolved.extra
        const looksResolved = Boolean(extra) || title !== fallbackTitle(item.url)
        if (looksResolved) {
          cache[item.url] = { title, extra, fetchedAt: now }
          dirty = true
        }
      }
    }
    out.push({ url: item.url, title, extra, note: item.note })
  }

  if (dirty) writeCache(cache)
  return out
}
