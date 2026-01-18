import type { Block } from '../models/canvas'

export const STORAGE_KEY = 'recap-canvas:v1'
export const ZOOM_KEY = 'recap-canvas:zoom'
const SCHEMA_VERSION = 1

type PersistedState = {
  schemaVersion: number
  blocks: Block[]
}

export function loadState(): Block[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.blocks)) {
      return null
    }
    return parsed.blocks as Block[]
  } catch (err) {
    console.warn('Failed to load canvas state', err)
    return null
  }
}

export function saveState(blocks: Block[]) {
  if (typeof window === 'undefined') return
  const payload: PersistedState = {
    schemaVersion: SCHEMA_VERSION,
    blocks,
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch (err) {
    console.warn('Failed to save canvas state', err)
  }
}

export function loadZoom(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(ZOOM_KEY)
    if (!raw) return null
    const num = Number(raw)
    if (Number.isFinite(num)) return num
  } catch (err) {
    console.warn('Failed to load zoom', err)
  }
  return null
}

export function saveZoom(zoom: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ZOOM_KEY, String(zoom))
  } catch (err) {
    console.warn('Failed to save zoom', err)
  }
}
