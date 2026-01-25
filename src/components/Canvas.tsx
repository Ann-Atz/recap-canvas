import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { PointerEvent } from 'react'
import type { Block, SummaryBlock } from '../models/canvas'
import { createId, seedBlocks } from '../models/canvas'
import { summarizeSelection } from '../ai/summarize'
import { BlockView } from './BlockView'
import { loadState, loadZoom, saveState, saveZoom, STORAGE_KEY } from '../state/persistence'

const CANVAS_WIDTH = 2600
const CANVAS_HEIGHT = 1800
const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.4
type Tool = 'select' | 'text' | 'image' | 'link'

export function Canvas() {
  const initialBlocksRef = useRef<Block[] | null>(null)
  const initialZoomRef = useRef<number | null>(null)
  if (initialBlocksRef.current === null) initialBlocksRef.current = loadState()
  if (initialZoomRef.current === null) initialZoomRef.current = loadZoom()

  const [blocks, setBlocks] = useState<Block[]>(() => initialBlocksRef.current ?? seedBlocks)
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState<number>(() => {
    const stored = initialZoomRef.current
    const fallback = 0.75
    const value = stored ?? fallback
    return Math.min(2, Math.max(0.5, value))
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selection, setSelection] = useState<{
    active: boolean
    pointerId: number | null
    originX: number
    originY: number
    currentX: number
    currentY: number
  }>({ active: false, pointerId: null, originX: 0, originY: 0, currentX: 0, currentY: 0 })
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const didInitialCenterRef = useRef(false)

  const handlePositionChange = (id: string, x: number, y: number) => {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, x, y } : block))
    )
  }

  const clearSelection = () => setSelectedIds([])
  useEffect(() => {
    saveState(blocks)
  }, [blocks])

  useEffect(() => {
    saveZoom(zoom)
  }, [zoom])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (selectedIds.length === 0) return
      const tag = (event.target as HTMLElement | null)?.tagName
      if (tag && ['INPUT', 'TEXTAREA'].includes(tag)) return
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        deleteBlocks(selectedIds)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [selectedIds])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveTool('select')
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  const addTextBlock = (position: { x: number; y: number }) => {
    const now = new Date().toISOString()
    const pos = clampPosition(position.x, position.y, 340, 140)
    const block: Block = {
      id: createId('T'),
      type: 'text',
      text: 'New note…',
      x: pos.x,
      y: pos.y,
      width: 340,
      createdAt: now,
      updatedAt: now,
    }
    setBlocks((prev) => [...prev, block])
    setSelectedIds([block.id])
  }

  const addImageBlock = (position: { x: number; y: number }) => {
    const url = window.prompt('Image URL?')
    if (!url) return
    const now = new Date().toISOString()
    const defaultAspect = 0.75
    const pos = clampPosition(position.x, position.y, 320, 320 * defaultAspect)
    const block: Block = {
      id: createId('IMG'),
      type: 'image',
      src: url,
      x: pos.x,
      y: pos.y,
      width: 320,
      height: undefined,
      aspectRatio: defaultAspect,
      createdAt: now,
      updatedAt: now,
    }
    setBlocks((prev) => [...prev, block])
    setSelectedIds([block.id])
  }

  const addLinkBlock = (position: { x: number; y: number }) => {
    const url = window.prompt('Link URL?')
    if (!url) return
    const labelInput = window.prompt('Link label?', url) || ''
    const label = labelInput.trim() || url
    const now = new Date().toISOString()
    const pos = clampPosition(position.x, position.y, 360, 110)
    const block: Block = {
      id: createId('L'),
      type: 'link',
      url,
      label,
      x: pos.x,
      y: pos.y,
      width: 360,
      height: 110,
      createdAt: now,
      updatedAt: now,
    }
    setBlocks((prev) => [...prev, block])
    setSelectedIds([block.id])
  }

  const getSelectedBlocks = (): Block[] => blocks.filter((b) => selectedIds.includes(b.id))
  const getBlockHeight = (block: Block) => {
    if (block.type === 'image') {
      const ratio =
        block.aspectRatio ??
        (typeof block.height === 'number' && block.height > 0 ? block.height / block.width : 0.75)
      return block.width * ratio
    }
    return block.height ?? 120
  }
  const focusedSummary = (() => {
    const summaries = getSelectedBlocks().filter((b): b is SummaryBlock => b.type === 'summary')
    return summaries[0] ?? null
  })()
  const evidenceHighlightIds = new Set(focusedSummary?.evidenceBlockIds ?? [])

  const selectionBounds = (() => {
    const selected = getSelectedBlocks()
    if (selected.length === 0) return null
    const minX = Math.min(...selected.map((b) => b.x))
    const maxX = Math.max(...selected.map((b) => b.x + b.width))
    const minY = Math.min(...selected.map((b) => b.y))
    const maxY = Math.max(...selected.map((b) => b.y + getBlockHeight(b)))
    return { minX, maxX, minY, maxY }
  })()

  const intersects = (a: { x: number; y: number; width: number; height: number }, b: Block) => {
    const bHeight = getBlockHeight(b)
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + bHeight && a.y + a.height > b.y
  }

  const getSelectionRect = () => {
    if (!selection.active) return null
    const x = Math.min(selection.originX, selection.currentX)
    const y = Math.min(selection.originY, selection.currentY)
    const width = Math.abs(selection.currentX - selection.originX)
    const height = Math.abs(selection.currentY - selection.originY)
    return { x, y, width, height }
  }

  const deleteBlocks = (ids: string[]) => {
    if (!ids.length) return
    setBlocks((prev) => prev.filter((block) => !ids.includes(block.id)))
    setSelectedIds([])
  }

  const adjustZoom = (delta: number) => {
    setZoom((prev) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((prev + delta) * 10) / 10))
      return next
    })
  }

  const handleCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.button !== 0 && event.pointerType !== 'touch') return

    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom

    if (activeTool !== 'select') {
      const { x: px, y: py } = clampPosition(x, y, 0, 0)
      if (activeTool === 'text') addTextBlock({ x: px, y: py })
      if (activeTool === 'image') addImageBlock({ x: px, y: py })
      if (activeTool === 'link') addLinkBlock({ x: px, y: py })
      setActiveTool('select')
      return
    }

    setSelection({
      active: true,
      pointerId: event.pointerId,
      originX: x,
      originY: y,
      currentX: x,
      currentY: y,
    })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!selection.active || selection.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom
    setSelection((prev) => ({ ...prev, currentX: x, currentY: y }))
  }

  const handleCanvasPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!selection.active || selection.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const rect = getSelectionRect()
    const dx = selection.currentX - selection.originX
    const dy = selection.currentY - selection.originY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (!rect || distance < 6) {
      clearSelection()
      setSelection({ active: false, pointerId: null, originX: 0, originY: 0, currentX: 0, currentY: 0 })
      return
    }

    const newlySelected = blocks.filter((block) => intersects(rect, block)).map((b) => b.id)
    setSelectedIds(newlySelected)

    setSelection({ active: false, pointerId: null, originX: 0, originY: 0, currentX: 0, currentY: 0 })
  }

  const clampPosition = (x: number, y: number, width: number, height: number) => {
    const clampedX = Math.max(0, Math.min(x, CANVAS_WIDTH - width))
    const clampedY = Math.max(0, Math.min(y, CANVAS_HEIGHT - height))
    return { x: clampedX, y: clampedY }
  }

  const computeSummaryPosition = (summarySize: { width: number; height: number }) => {
    if (!selectionBounds) return { x: 0, y: 0 }
    const { width, height } = summarySize
    const scrollEl = scrollRef.current
    const visibleRight = scrollEl ? scrollEl.scrollLeft + scrollEl.clientWidth : CANVAS_WIDTH
    const visibleBottom = scrollEl ? scrollEl.scrollTop + scrollEl.clientHeight : CANVAS_HEIGHT

    const rightPlacement = { x: selectionBounds.maxX + 40, y: selectionBounds.minY }
    const belowPlacement = { x: selectionBounds.minX, y: selectionBounds.maxY + 40 }

    let chosen = rightPlacement
    if (rightPlacement.x + width > visibleRight) {
      chosen = belowPlacement
    }
    if (chosen.y + height > visibleBottom && rightPlacement.x + width <= visibleRight) {
      chosen = rightPlacement
    }

    return clampPosition(chosen.x, chosen.y, width, height)
  }

  const handleToolSelect = (tool: Tool) => {
    setActiveTool(tool)
  }

  const handleWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const scrollEl = scrollRef.current
    if (!scrollEl) return

    const zoomDelta = -event.deltaY * 0.0015
    if (zoomDelta === 0) return
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + zoomDelta))
    if (nextZoom === zoom) return

    const rect = scrollEl.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top
    const canvasX = (scrollEl.scrollLeft + pointerX) / zoom
    const canvasY = (scrollEl.scrollTop + pointerY) / zoom

    setZoom(nextZoom)

    const targetLeft = canvasX * nextZoom - pointerX
    const targetTop = canvasY * nextZoom - pointerY
    const maxScrollLeft = Math.max(0, CANVAS_WIDTH * nextZoom - scrollEl.clientWidth)
    const maxScrollTop = Math.max(0, CANVAS_HEIGHT * nextZoom - scrollEl.clientHeight)
    scrollEl.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxScrollLeft)),
      top: Math.max(0, Math.min(targetTop, maxScrollTop)),
    })
  }

  const handleUpdateBlock = (id: string, updater: (block: Block) => Block) => {
    setBlocks((prev) =>
      prev.map((block) => (block.id === id ? updater({ ...block, updatedAt: new Date().toISOString() }) : block))
    )
  }

  const ensureRectInView = (rect: { x: number; y: number; width: number; height: number }) => {
    const scrollEl = scrollRef.current
    if (!scrollEl) return
    const padding = 80
    const padded = {
      x: Math.max(0, rect.x - padding),
      y: Math.max(0, rect.y - padding),
      width: Math.min(CANVAS_WIDTH, rect.width + padding * 2),
      height: Math.min(CANVAS_HEIGHT, rect.height + padding * 2),
    }
    const viewLeft = scrollEl.scrollLeft / zoom
    const viewTop = scrollEl.scrollTop / zoom
    const viewWidth = scrollEl.clientWidth / zoom
    const viewHeight = scrollEl.clientHeight / zoom
    const viewRight = viewLeft + viewWidth
    const viewBottom = viewTop + viewHeight
    const paddedRight = padded.x + padded.width
    const paddedBottom = padded.y + padded.height

    const alreadyVisible =
      viewLeft <= padded.x &&
      viewTop <= padded.y &&
      viewRight >= paddedRight &&
      viewBottom >= paddedBottom
    if (alreadyVisible) return

    const zoomToFit = Math.min(scrollEl.clientWidth / padded.width, scrollEl.clientHeight / padded.height)
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomToFit))

    const centerX = padded.x + padded.width / 2
    const centerY = padded.y + padded.height / 2
    const targetLeft = centerX * nextZoom - scrollEl.clientWidth / 2
    const targetTop = centerY * nextZoom - scrollEl.clientHeight / 2
    const maxScrollLeft = Math.max(0, CANVAS_WIDTH * nextZoom - scrollEl.clientWidth)
    const maxScrollTop = Math.max(0, CANVAS_HEIGHT * nextZoom - scrollEl.clientHeight)

    setZoom(nextZoom)
    scrollEl.scrollTo({
      left: Math.max(0, Math.min(targetLeft, maxScrollLeft)),
      top: Math.max(0, Math.min(targetTop, maxScrollTop)),
    })
  }

  const handleSummarize = () => {
    const selected = getSelectedBlocks()
    if (selected.length < 2 || !selectionBounds) return
    const content = summarizeSelection(selected)
    const summarySize = { width: 360, height: 260 }
    const position = computeSummaryPosition(summarySize)
    const newSummary: SummaryBlock = {
      id: createId('SUM'),
      type: 'summary',
      title: content.title,
      sections: content.sections,
      evidenceBlockIds: content.evidenceBlockIds,
      x: position.x,
      y: position.y,
      width: summarySize.width,
      height: summarySize.height,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setBlocks((prev) => [...prev, newSummary])

    const selectionRect = selectionBounds
    const summaryRect = {
      x: position.x,
      y: position.y,
      width: summarySize.width,
      height: summarySize.height,
    }
    const targetRect = {
      x: Math.min(selectionRect.minX, summaryRect.x),
      y: Math.min(selectionRect.minY, summaryRect.y),
      width: Math.max(selectionRect.maxX, summaryRect.x + summaryRect.width) - Math.min(selectionRect.minX, summaryRect.x),
      height: Math.max(selectionRect.maxY, summaryRect.y + summaryRect.height) - Math.min(selectionRect.minY, summaryRect.y),
    }
    ensureRectInView(targetRect)
  }

  useEffect(() => {
    if (didInitialCenterRef.current) return
    if (initialBlocksRef.current) return
    const el = scrollRef.current
    if (!el || blocks.length === 0) return
    const minX = Math.min(...blocks.map((b) => b.x))
    const maxX = Math.max(...blocks.map((b) => b.x + b.width))
    const minY = Math.min(...blocks.map((b) => b.y))
    const maxY = Math.max(...blocks.map((b) => b.y + getBlockHeight(b)))
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    const targetLeft = centerX * zoom - el.clientWidth / 2
    const targetTop = centerY * zoom - el.clientHeight / 2
    el.scrollLeft = Math.max(0, targetLeft)
    el.scrollTop = Math.max(0, targetTop)
    didInitialCenterRef.current = true
  }, [blocks, zoom])

  return (
    <div className="canvas-scroll" role="region" aria-label="Canvas" ref={scrollRef}>
      <div className="toolbox">
        {(['select', 'text', 'image', 'link'] as Tool[]).map((tool) => (
          <button
            key={tool}
            className={`tool-btn ${activeTool === tool ? 'active' : ''}`}
            onClick={() => handleToolSelect(tool)}
          >
            <span className="tool-emoji">
              {tool === 'select' && '🖱️'}
              {tool === 'text' && '✏️'}
              {tool === 'image' && '🖼️'}
              {tool === 'link' && '🔗'}
            </span>
            <span className="tool-label">{tool}</span>
          </button>
        ))}
      </div>
      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => adjustZoom(0.1)}>
          Zoom +
        </button>
        <button className="zoom-btn" onClick={() => adjustZoom(-0.1)}>
          Zoom -
        </button>
      </div>
      {import.meta.env.DEV && (
        <div className="dev-reset">
          <button
            className="dev-reset-btn"
            onClick={() => {
              const confirmReset = window.confirm('Resets the canvas to the original handover state. Changes made this session will be cleared.')
              if (!confirmReset) return
              try {
                window.localStorage.removeItem(STORAGE_KEY)
                window.localStorage.removeItem('recap-canvas:zoom')
                // Remove any zoom key if present in the future.
                window.location.reload()
              } catch (err) {
                console.warn('Reset failed', err)
              }
            }}
          >
            Reset Canvas
          </button>
        </div>
      )}
      <div
        className="canvas"
        style={{
          cursor: activeTool === 'select' ? 'default' : 'crosshair',
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        }}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={handleCanvasPointerEnd}
        onPointerCancel={handleCanvasPointerEnd}
        onWheel={handleWheelZoom}
      >
        {selectionBounds && selectedIds.length >= 2 && (
          <button
            className="summarize-action"
            style={{
              left: (selectionBounds.minX + selectionBounds.maxX) / 2,
              top: Math.max(selectionBounds.minY - 12, 6),
              transform: 'translate(-50%, 0)',
            }}
            onClick={(e) => {
              e.stopPropagation()
              handleSummarize()
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Summarize selection
          </button>
        )}
        {blocks.map((block) => (
          <BlockView
            key={block.id}
            block={block}
            selected={selectedIds.includes(block.id)}
            highlight={focusedSummary ? (block.type === 'summary' && focusedSummary.id === block.id) || evidenceHighlightIds.has(block.id) : false}
            dimmed={Boolean(focusedSummary && !evidenceHighlightIds.has(block.id) && block.id !== focusedSummary.id)}
            zoom={zoom}
            onPositionChange={handlePositionChange}
            onUpdate={handleUpdateBlock}
            onDelete={(id) => deleteBlocks([id])}
            onSelect={(id, mode) => {
              if (mode === 'single') {
                setSelectedIds([id])
              } else {
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]
                )
              }
            }}
          />
        ))}
        {selection.active && (() => {
          const rect = getSelectionRect()
          if (!rect) return null
          return (
            <div
              className="selection-rect"
              style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
            />
          )
        })()}
      </div>
    </div>
  )
}
