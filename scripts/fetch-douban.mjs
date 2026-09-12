#!/usr/bin/env node
/**
 * Build-time Douban shelf fetcher via Frodo (mobile) API.
 *
 * Uses public Android app apiKey + HMAC-SHA1 secret (same as Douban APK /
 * douban-skill). No user login / cookies / Bearer token.
 *
 * Soft-fail: on network/API errors keep existing src/data/douban.json and exit 0
 * so CI/build still succeeds.
 *
 * After fetch, downloads newest COVER_LIMIT_PER_TYPE covers per type into
 * public/douban/{id}.{jpg|webp} and rewrites item.cover to the local path.
 *
 * Usage:
 *   npm run douban
 *   DOUBAN_USER_ID=153627368 node scripts/fetch-douban.mjs
 *   node scripts/fetch-douban.mjs --covers-only
 *   DOUBAN_FORCE_COVERS=1 node scripts/fetch-douban.mjs --covers-only
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_FILE = path.join(ROOT, 'src/data/douban.json')
const COVER_DIR = path.join(ROOT, 'public/douban')

const API_KEY = '0dad551ec0f84ed02907ff5c42e8ec70'
const HMAC_SECRET = 'bf7dddc7c9cfe6f7'
const BASE_URL = 'https://frodo.douban.com'
const USER_AGENT =
  'api-client/1 com.douban.frodo/7.22.0.beta9(231) Android/23 product/Mate40 vendor/HUAWEI model/Mate40 brand/HUAWEI rom/android network/wifi platform/AndroidPad'

const PAGE_SIZE = 50
const PAGE_DELAY_MS = 1200
const TYPE_DELAY_MS = 1800
const MAX_RETRIES = 3
const MAX_PAGES = 500
const COVER_LIMIT_PER_TYPE = 10
const COVER_MIN_BYTES = 1024
const COVER_DELAY_MS = 200

/** @type {const} */
const TYPES = ['movie', 'music', 'game']

const STATUS_LABEL = {
  movie: '看过',
  music: '听过',
  game: '玩过'
}

const DISPLAY_NAME = '小新一点'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveUserId() {
  let id = (process.env.DOUBAN_USER_ID || '153627368').trim()
  const m = id.match(/douban\.com\/people\/([A-Za-z0-9._-]+)/)
  if (m) id = m[1]
  if (!/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`Invalid DOUBAN_USER_ID: ${id}`)
  }
  return id
}

/** Sign path only (no query). */
function computeSig(apiPath, ts) {
  const raw = `GET&${encodeURIComponent(apiPath)}&${ts}`
  return crypto.createHmac('sha1', HMAC_SECRET).update(raw).digest('base64')
}

async function frodoGet(apiPath, query) {
  const ts = String(Math.floor(Date.now() / 1000))
  const _sig = computeSig(apiPath, ts)
  const params = new URLSearchParams({
    ...query,
    apiKey: API_KEY,
    _ts: ts,
    _sig,
    os_rom: 'android'
  })
  const url = `${BASE_URL}${apiPath}?${params}`
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { error: text.slice(0, 200) }
  }
  return { status: res.status, data }
}

function pickCover(subject) {
  return (
    subject?.cover_url ||
    subject?.pic?.normal ||
    subject?.pic?.large ||
    ''
  )
}

function normalizeInterest(interest, type) {
  const subject = interest?.subject || {}
  const sid = String(subject.id || interest.id || '')
  const ratingObj = interest?.rating
  let rating
  if (ratingObj && typeof ratingObj === 'object' && ratingObj.value) {
    const max = ratingObj.max || 5
    rating = max <= 5 ? Number(ratingObj.value) : Number(ratingObj.value) / 2
  }
  const dateRaw = interest?.create_time || ''
  const date = /^\d{4}-\d{2}-\d{2}/.test(dateRaw) ? dateRaw.slice(0, 10) : undefined

  return {
    id: sid,
    title: subject.title || 'Untitled',
    cover: pickCover(subject),
    url: subject.url || `https://www.douban.com/subject/${sid}/`,
    type,
    status: STATUS_LABEL[type] || interest?.status || 'done',
    ...(rating != null ? { rating } : {}),
    ...(date ? { date } : {})
  }
}

async function fetchType(userId, type) {
  const apiPath = `/api/v2/user/${userId}/interests`
  const items = []
  let start = 0
  let total = null
  let retries = 0
  let pages = 0

  while (pages < MAX_PAGES) {
    pages += 1
    const { status, data } = await frodoGet(apiPath, {
      type,
      status: 'done',
      start: String(start),
      count: String(PAGE_SIZE)
    })

    if (status !== 200) {
      retries += 1
      if (retries > MAX_RETRIES) {
        throw new Error(
          `Frodo HTTP ${status} for type=${type} after ${MAX_RETRIES} retries: ${JSON.stringify(data).slice(0, 180)}`
        )
      }
      const delay = 4000 * 2 ** (retries - 1)
      console.warn(`[douban] HTTP ${status} type=${type}, retry ${retries}/${MAX_RETRIES} in ${delay}ms`)
      await sleep(delay)
      continue
    }

    retries = 0
    if (total == null) {
      total = Number(data.total ?? 0)
      console.log(`[douban] ${type}: total=${total}`)
      if (total === 0) return items
    }

    const batch = Array.isArray(data.interests) ? data.interests : []
    if (batch.length === 0) break

    for (const row of batch) {
      items.push(normalizeInterest(row, type))
    }
    console.log(`[douban] ${type}: fetched ${items.length}/${total}`)

    if (items.length >= total) break
    start += batch.length
    await sleep(PAGE_DELAY_MS)
  }

  return items
}

function readExistingCache() {
  try {
    if (!fs.existsSync(OUT_FILE)) return null
    return JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'))
  } catch {
    return null
  }
}

function writeEmptySample(userId, reason) {
  const existing = readExistingCache()
  if (existing?.items?.length) {
    console.warn(`[douban] Keep existing cache (${existing.items.length} items). Reason: ${reason}`)
    return existing
  }
  const sample = {
    updatedAt: new Date().toISOString(),
    userId,
    displayName: DISPLAY_NAME,
    profileUrl: `https://www.douban.com/people/${userId}/`,
    fetchError: reason,
    items: []
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(sample, null, 2) + '\n')
  console.warn(`[douban] Wrote empty cache → ${OUT_FILE}`)
  return sample
}

function extFromUrlOrType(url, contentType) {
  const ct = (contentType || '').toLowerCase()
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('png')) return 'png'
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg'
  const m = String(url || '').match(/\.(webp|jpe?g|png)(?:\?|$)/i)
  if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase()
  return 'jpg'
}

function refererForType(type) {
  if (type === 'music') return 'https://music.douban.com/'
  if (type === 'game') return 'https://www.douban.com/'
  return 'https://movie.douban.com/'
}

function findExistingLocalCover(id) {
  for (const ext of ['webp', 'jpg', 'jpeg', 'png']) {
    const p = path.join(COVER_DIR, `${id}.${ext}`)
    try {
      const st = fs.statSync(p)
      if (st.size > COVER_MIN_BYTES) return `/douban/${id}.${ext === 'jpeg' ? 'jpg' : ext}`
    } catch {
      /* missing */
    }
  }
  return null
}

async function downloadOneCover(remoteUrl, destPath, type) {
  const attempts = [
    {
      'User-Agent': BROWSER_UA,
      Referer: refererForType(type),
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
    },
    {
      'User-Agent': BROWSER_UA,
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      // no Referer
    },
    {
      'User-Agent': USER_AGENT,
      Referer: refererForType(type),
      Accept: 'image/*'
    }
  ]

  let lastErr = ''
  for (const headers of attempts) {
    try {
      const res = await fetch(remoteUrl, { headers, redirect: 'follow' })
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`
        continue
      }
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length <= COVER_MIN_BYTES) {
        lastErr = `tiny body ${buf.length}B`
        continue
      }
      const ext = extFromUrlOrType(remoteUrl, res.headers.get('content-type'))
      const finalPath = destPath.replace(/\.[^.]+$/, `.${ext}`)
      fs.mkdirSync(path.dirname(finalPath), { recursive: true })
      fs.writeFileSync(finalPath, buf)
      return { ok: true, path: finalPath, size: buf.length, status: res.status }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  return { ok: false, error: lastErr }
}

/**
 * Download newest COVER_LIMIT_PER_TYPE covers per type into public/douban/.
 * Mutates items: sets coverRemote, cover → local path (or '' on failure).
 */
async function downloadHomepageCovers(items, { force = false } = {}) {
  fs.mkdirSync(COVER_DIR, { recursive: true })
  // Ensure dir is tracked: placeholder so empty dirs don't vanish; .gitkeep optional
  const keep = path.join(COVER_DIR, '.gitkeep')
  if (!fs.existsSync(keep)) fs.writeFileSync(keep, '')

  const byId = new Map(items.map((it) => [it.id, it]))
  const targets = []
  for (const type of TYPES) {
    const slice = items.filter((i) => i.type === type).slice(0, COVER_LIMIT_PER_TYPE)
    targets.push(...slice)
  }

  console.log(
    `[douban] Covers: downloading up to ${COVER_LIMIT_PER_TYPE}/type (${targets.length} items)${force ? ' [force]' : ''}`
  )

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const item of targets) {
    const remote =
      (item.coverRemote && /^https?:\/\//.test(item.coverRemote) && item.coverRemote) ||
      (/^https?:\/\//.test(item.cover) && item.cover) ||
      ''

    if (!remote) {
      // already local or empty
      const local = item.cover?.startsWith('/douban/') ? item.cover : findExistingLocalCover(item.id)
      if (local) {
        item.cover = local
        skipped += 1
        continue
      }
      item.cover = ''
      failed += 1
      console.warn(`[douban] cover missing remote for id=${item.id} (${item.title})`)
      continue
    }

    if (!item.coverRemote) item.coverRemote = remote

    if (!force) {
      const existing = findExistingLocalCover(item.id)
      if (existing) {
        item.cover = existing
        skipped += 1
        continue
      }
    }

    const baseDest = path.join(COVER_DIR, `${item.id}.jpg`)
    const result = await downloadOneCover(remote, baseDest, item.type)
    if (result.ok) {
      const fileName = path.basename(result.path)
      item.cover = `/douban/${fileName}`
      ok += 1
      console.log(`[douban] cover OK ${item.id} → ${item.cover} (${result.size}B, HTTP ${result.status})`)
    } else {
      item.cover = '' // placeholder title text in UI, not broken remote
      failed += 1
      console.warn(`[douban] cover FAIL ${item.id} (${item.title}): ${result.error}`)
    }
    await sleep(COVER_DELAY_MS)
  }

  // Touch Map so unused warning stays quiet; items already mutated by reference
  void byId

  console.log(`[douban] Covers done: ok=${ok} skipped=${skipped} failed=${failed}`)
  return { ok, skipped, failed }
}

function writePayload(payload) {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true })
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2) + '\n')
}

async function coversOnly() {
  const existing = readExistingCache()
  if (!existing?.items?.length) {
    console.warn('[douban] --covers-only: no cached items in douban.json')
    return
  }
  const force = process.env.DOUBAN_FORCE_COVERS === '1' || process.argv.includes('--force')
  await downloadHomepageCovers(existing.items, { force })
  writePayload(existing)
  console.log(`[douban] Updated covers in ${OUT_FILE}`)
}

async function main() {
  if (process.argv.includes('--covers-only')) {
    await coversOnly()
    return
  }

  const userId = resolveUserId()
  console.log(`[douban] Fetching done shelves for user ${userId} (${DISPLAY_NAME})`)
  console.log(`[douban] Types: ${TYPES.join(', ')} · status=done only`)

  /** @type {any[]} */
  const all = []
  const counts = { movie: 0, music: 0, game: 0 }

  try {
    for (let i = 0; i < TYPES.length; i++) {
      const type = TYPES[i]
      const items = await fetchType(userId, type)
      counts[type] = items.length
      all.push(...items)
      if (i < TYPES.length - 1) await sleep(TYPE_DELAY_MS)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[douban] Fetch failed: ${msg}`)
    writeEmptySample(userId, msg)
    process.exitCode = 0
    return
  }

  const force = process.env.DOUBAN_FORCE_COVERS === '1' || process.argv.includes('--force')
  await downloadHomepageCovers(all, { force })

  const payload = {
    updatedAt: new Date().toISOString(),
    userId,
    displayName: DISPLAY_NAME,
    profileUrl: `https://www.douban.com/people/${userId}/`,
    counts,
    items: all
  }

  writePayload(payload)
  console.log(
    `[douban] Wrote ${all.length} items → ${OUT_FILE} (movie=${counts.movie}, music=${counts.music}, game=${counts.game})`
  )
}

main().catch((err) => {
  console.warn(`[douban] Unexpected error: ${err instanceof Error ? err.message : err}`)
  try {
    writeEmptySample(process.env.DOUBAN_USER_ID || '153627368', String(err))
  } catch {
    /* ignore */
  }
  process.exitCode = 0
})
