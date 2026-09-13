#!/usr/bin/env node
/**
 * Auto pipeline: tracks/gpx/*.gpx → src/data/tracks.json + public/tracks/*.geojson
 * Drop new GPX files and rebuild (CI already runs this).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const gpxDir = path.join(root, 'tracks', 'gpx')
const outJson = path.join(root, 'src', 'data', 'tracks.json')
const outGeo = path.join(root, 'public', 'tracks')

fs.mkdirSync(gpxDir, { recursive: true })
fs.mkdirSync(outGeo, { recursive: true })
fs.mkdirSync(path.dirname(outJson), { recursive: true })

function slugify(name) {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w\u4e00-\u9fff-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'track'
  )
}

function haversineKm(a, b) {
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function parseGpx(xml, fileBase) {
  const nameMatch = xml.match(/<name>([^<]*)<\/name>/)
  const name = (nameMatch?.[1] || fileBase).trim()

  const times = [...xml.matchAll(/<time>([^<]+)<\/time>/g)].map((m) => m[1])
  const startTime = times[0] || null
  const endTime = times.length ? times[times.length - 1] : null

  // Prefer trkpt; fall back to rtept
  let pts = [...xml.matchAll(/<trkpt\s+([^>]+)>/gi)].map((m) => m[1])
  if (!pts.length) pts = [...xml.matchAll(/<rtept\s+([^>]+)>/gi)].map((m) => m[1])

  const coordinates = []
  for (const attrs of pts) {
    const lat = attrs.match(/\blat="([^"]+)"/i)?.[1]
    const lon = attrs.match(/\blon="([^"]+)"/i)?.[1]
    if (lat == null || lon == null) continue
    const la = Number(lat)
    const lo = Number(lon)
    if (!Number.isFinite(la) || !Number.isFinite(lo)) continue
    coordinates.push([lo, la])
  }

  let distanceKm = 0
  for (let i = 1; i < coordinates.length; i++) {
    distanceKm += haversineKm(coordinates[i - 1], coordinates[i])
  }

  // Simplify very dense tracks for web (keep ~every nth point, always ends)
  const maxPts = 2000
  let simplified = coordinates
  if (coordinates.length > maxPts) {
    const step = Math.ceil(coordinates.length / maxPts)
    simplified = coordinates.filter((_, i) => i % step === 0 || i === coordinates.length - 1)
  }

  return {
    name,
    startTime,
    endTime,
    pointCount: coordinates.length,
    distanceKm: Math.round(distanceKm * 100) / 100,
    coordinates: simplified
  }
}

function bboxOf(coords) {
  if (!coords.length) return null
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

const files = fs
  .readdirSync(gpxDir)
  .filter((f) => f.toLowerCase().endsWith('.gpx'))
  .sort()

// clean old geojson we generated (keep folder)
for (const f of fs.readdirSync(outGeo)) {
  if (f.endsWith('.geojson')) fs.unlinkSync(path.join(outGeo, f))
}

const tracks = []
for (const file of files) {
  const full = path.join(gpxDir, file)
  const xml = fs.readFileSync(full, 'utf8')
  const base = path.basename(file, path.extname(file))
  const parsed = parseGpx(xml, base)
  if (parsed.coordinates.length < 2) {
    console.warn(`[tracks] skip ${file}: need ≥2 points`)
    continue
  }
  const hash = crypto.createHash('sha1').update(xml).digest('hex').slice(0, 10)
  const id = `${slugify(base)}-${hash}`
  const geoName = `${id}.geojson`
  const geojson = {
    type: 'Feature',
    properties: {
      id,
      name: parsed.name,
      distanceKm: parsed.distanceKm,
      startTime: parsed.startTime,
      endTime: parsed.endTime,
      source: file
    },
    geometry: {
      type: 'LineString',
      coordinates: parsed.coordinates
    }
  }
  fs.writeFileSync(path.join(outGeo, geoName), JSON.stringify(geojson))
  tracks.push({
    id,
    name: parsed.name,
    source: file,
    geojson: `/tracks/${geoName}`,
    distanceKm: parsed.distanceKm,
    pointCount: parsed.pointCount,
    startTime: parsed.startTime,
    endTime: parsed.endTime,
    bbox: bboxOf(parsed.coordinates)
  })
}

tracks.sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))

const payload = {
  updatedAt: new Date().toISOString(),
  count: tracks.length,
  tracks
}
fs.writeFileSync(outJson, JSON.stringify(payload, null, 2) + '\n')
console.log(`[tracks] ${tracks.length} track(s) → ${path.relative(root, outJson)}`)
