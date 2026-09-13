export type TrackMeta = {
  id: string
  name: string
  source: string
  geojson: string
  distanceKm: number
  pointCount: number
  startTime: string | null
  endTime: string | null
  bbox: [number, number, number, number] | null
}

export type TracksCatalog = {
  updatedAt: string | null
  count: number
  tracks: TrackMeta[]
}
