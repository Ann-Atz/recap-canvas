import { useEffect, useRef, useState, useMemo } from 'react'
import type React from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Block, SummaryBlock, SummarySpan } from '../models/canvas'
import { createId, seedBlocks } from '../models/canvas'
import { summarizeSelection } from '../ai/summarize'
import { BlockView } from './BlockView'
import { loadState, loadZoom, saveState, saveZoom, STORAGE_KEY } from '../state/persistence'

const CANVAS_WIDTH = 2600
const CANVAS_HEIGHT = 1800
const MIN_ZOOM = 0.4
const MAX_ZOOM = 1.4
type Tool = 'select' | 'text' | 'image' | 'link'

type CanvasSummaryData = {
  id: string
  title: string
  totalBlocks: number
  sections: Record<string, string>
  evidence: string[]
  summaryText: string
  scope: { kind: 'canvas'; blockIds: string[] }
  qa: Array<{
    id: string
    question: string
    answer: string
    citations: { n: number; blockIds: string[] }[]
    createdAt: number
  }>
  messages: Array<
    | { id: string; role: 'user'; text: string; createdAt: number }
    | { id: string; role: 'assistant'; text: string; citations: { n: number; blockIds: string[] }[]; createdAt: number }
  >
  citations?: { n: number; blockIds: string[] }[]
  spans?: SummarySpan[]
}

const SUMMARY_PANEL_MIN_WIDTH = 280
const SUMMARY_PANEL_MAX_WIDTH = 720
const PANEL_CANVAS_KEY = 'recap-canvas:panel-canvas-summary'
const PANEL_SELECTION_KEY = 'recap-canvas:panel-selection-summary'
const PASTEL_COLORS = ['#f6d9d5', '#ffe8b3', '#dff5c8', '#cde8ff', '#e6d8ff', '#f8d9ef', '#d8f0f4', '#f2e6d8']

export function Canvas() {
  const initialBlocksRef = useRef<Block[] | null>(null)
  const initialZoomRef = useRef<number | null>(null)
  if (initialBlocksRef.current === null) initialBlocksRef.current = loadState()
  if (initialZoomRef.current === null) initialZoomRef.current = loadZoom()

  const [blocks, setBlocks] = useState<Block[]>(() => {
    const base = initialBlocksRef.current ?? seedBlocks
    return base
      .filter((b) => b.type !== 'summary' || b.summaryText) // keep summaries only if they have content
      .map((b) => {
        if (b.type !== 'summary') return b
        return {
          ...b,
          scope: b.scope ?? { kind: 'selection', blockIds: b.evidenceBlockIds ?? [] },
          qa: b.qa ?? [],
          messages: b.messages ?? [],
        }
      })
  })
  const [activeTool, setActiveTool] = useState<Tool>('select')
  const [zoom, setZoom] = useState<number>(() => {
    const stored = initialZoomRef.current
    const fallback = 0.75
    const value = stored ?? fallback
    return Math.min(2, Math.max(0.5, value))
  })
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [hoverHighlightIds, setHoverHighlightIds] = useState<string[]>([])
  const [pinnedHighlightIds, setPinnedHighlightIds] = useState<string[]>([])
  const [panelSummary, setPanelSummary] = useState<SummaryBlock | null>(null)
  const [canvasSummary, setCanvasSummary] = useState<CanvasSummaryData | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelWidth, setPanelWidth] = useState<number>(360)
  const panelResizeRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [qaQuestion, setQaQuestion] = useState<string>('')
  const chatBottomRef = useRef<HTMLDivElement | null>(null)
  const activeSummary = panelSummary ?? canvasSummary
  const activeMessages = activeSummary?.messages ?? []

  const CitationChip = ({
    citation,
    mode = 'chip',
  }: {
    citation: { n: number; blockIds: string[] }
    mode?: 'chip' | 'inline'
  }) => {
    const className = mode === 'chip' ? 'citation-chip' : 'citation-chip inline'
    return (
      <button
        type="button"
        className={className}
        onMouseEnter={() => handleCitationHover(citation.blockIds)}
        onMouseLeave={handleCitationLeave}
        onClick={(e) => {
          e.stopPropagation()
          handleCitationClick(citation.blockIds)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={`View sources for citation ${citation.n}`}
      >
        {citation.n}
      </button>
    )
  }

  const renderTextWithCitations = (
    text: string,
    citations: { n: number; blockIds: string[] }[]
  ) => {
    const parts: React.ReactNode[] = []
    const regex = /\[(\d+)\]/g
    let lastIndex = 0
    let match
    const citationMap = new Map(citations.map((c) => [String(c.n), c]))
    while ((match = regex.exec(text)) !== null) {
      const [token, num] = match
      const start = match.index
      if (start > lastIndex) {
        parts.push(text.slice(lastIndex, start))
      }
      const citation = citationMap.get(num)
      if (citation) {
        parts.push(<CitationChip key={`c-${num}-${start}`} citation={citation} mode="inline" />)
      } else {
        parts.push(token)
      }
      lastIndex = start + token.length
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }
    return parts
  }
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
  const blockLookup = useMemo(() => new Map(blocks.map((b) => [b.id, b])), [blocks])
  const activeHighlightIds = pinnedHighlightIds.length ? pinnedHighlightIds : hoverHighlightIds
  const activeHighlightSet = new Set(activeHighlightIds)

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
        setPinnedHighlightIds([])
        setHoverHighlightIds([])
        panelResizeRef.current = null
        setPanelOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PANEL_CANVAS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as CanvasSummaryData
        if (parsed && parsed.scope) {
          const summaryText =
            (parsed as any).summaryText ??
            Object.entries(parsed.sections || {}).map(([label, value]) => `• ${label}: ${value}`).join('\n')
          setCanvasSummary({ ...parsed, summaryText })
        }
      }
    } catch (err) {
      console.warn('Failed to load canvas summary', err)
    }
  }, [])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PANEL_SELECTION_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as SummaryBlock
        if (parsed && parsed.scope && parsed.summaryText) {
          setPanelSummary(parsed)
        }
      }
    } catch (err) {
      console.warn('Failed to load selection summary', err)
    }
  }, [])

  useEffect(() => {
    if (!chatBottomRef.current) return
    chatBottomRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [panelSummary?.messages, canvasSummary?.messages])

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

  const selectedBlocks = getSelectedBlocks()
  const hasSummaryRefSelected = selectedBlocks.some((b) => b.type === 'summary_ref')
  const selectionBounds = (() => {
    if (selectedBlocks.length === 0) return null
    const minX = Math.min(...selectedBlocks.map((b) => b.x))
    const maxX = Math.max(...selectedBlocks.map((b) => b.x + b.width))
    const minY = Math.min(...selectedBlocks.map((b) => b.y))
    const maxY = Math.max(...selectedBlocks.map((b) => b.y + getBlockHeight(b)))
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

  const pickPastelColor = (summaryId: string) => {
    const existing = blocks.filter((b): b is Extract<Block, { type: 'summary_ref' }> => b.type === 'summary_ref')
    const used = new Set(existing.map((b) => b.pastelColor))
    const unused = PASTEL_COLORS.find((c) => !used.has(c))
    if (unused) return unused
    let hash = 0
    for (const ch of summaryId) {
      hash = (hash * 31 + ch.charCodeAt(0)) % 100000
    }
    return PASTEL_COLORS[hash % PASTEL_COLORS.length]
  }

  const generateCanvasSummary = (allBlocks: Block[]): CanvasSummaryData => {
    const baseBlocks = allBlocks.filter((b) => b.type !== 'summary')
    const totalBlocks = baseBlocks.length
    if (totalBlocks === 0) {
      return {
        id: 'CANVAS-SUMMARY',
        title: 'Canvas summary',
        totalBlocks: 0,
        sections: {
          'What this file seems to be about': 'No blocks on canvas.',
          "What’s been explored so far": 'No blocks on canvas.',
          'Things that look tentatively decided': 'No blocks on canvas.',
          'Constraints or boundaries shaping the work': 'No blocks on canvas.',
          'Open questions or unresolved tensions': 'No blocks on canvas.',
          'What’s missing or unclear': 'Everything—canvas is empty.',
        },
        evidence: [],
        summaryText: '• No blocks on canvas.',
        scope: { kind: 'canvas', blockIds: [] },
        qa: [],
        messages: [],
      }
    }

    const textBlocks = baseBlocks.filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
    const linkBlocks = baseBlocks.filter((b): b is Extract<Block, { type: 'link' }> => b.type === 'link')
    const imageBlocks = baseBlocks.filter((b): b is Extract<Block, { type: 'image' }> => b.type === 'image')

    const gather = (regex: RegExp) => textBlocks.filter((b) => regex.test(b.text)).map((b) => b.text.trim())
    const truncate = (t: string, max = 220) => {
      const norm = t.replace(/\s+/g, ' ').trim()
      return norm.length > max ? `${norm.slice(0, max - 1)}…` : norm
    }

    const what = textBlocks.length
      ? truncate(textBlocks[0].text)
      : 'Limited information about the overall intent; needs clearer framing.'
    const explored = textBlocks.slice(1, 3).map((b) => truncate(b.text))
    const decisions = gather(/decision|decided|draft/i)
    const constraints = gather(/constraint|requires|must|cannot|no /i)
    const questions = gather(/question|uncertain|uncertainty|not sure|tension|should|how do/i)

    const evidence: string[] = []
    const addEvidence = (label: string) => {
      if (evidence.length >= 8) return
      evidence.push(label)
    }

    textBlocks.slice(0, 4).forEach((b) => addEvidence(`block:${b.id} (text)`))
    imageBlocks.slice(0, 2).forEach((b) => {
      const desc = 'Image present (no caption provided).'
      addEvidence(`block:${b.id} (image) — ${desc}`)
    })
    linkBlocks.slice(0, 2).forEach((b) => addEvidence(`block:${b.id} (link) — ${b.label} (${b.url})`))

    const sections: Record<string, string> = {
      'What this file seems to be about': what,
      "What’s been explored so far": explored.length ? explored.join(' ') : 'Sparse notes on exploration; needs more articulation.',
      'Things that look tentatively decided': decisions.length ? decisions.join(' ') : 'No clear decisions; everything reads as exploratory.',
      'Constraints or boundaries shaping the work': constraints.length ? constraints.join(' ') : 'Constraints are weakly stated; call out must-haves explicitly.',
      'Open questions or unresolved tensions': questions.length ? questions.join(' ') : 'Questions are implicit; make uncertainties explicit.',
      'What’s missing or unclear': 'Success criteria, explicit user outcomes, and facilitation/flow details are not evident.',
    }

    const summaryText = Object.entries(sections)
      .map(([label, value]) => `• ${label}: ${value}`)
      .join('\n')

    return {
      id: 'CANVAS-SUMMARY',
      title: 'Canvas summary',
      totalBlocks,
      sections,
      evidence,
      summaryText,
      scope: { kind: 'canvas', blockIds: baseBlocks.map((b) => b.id) },
      qa: [],
      messages: [],
    }
  }

  const handleCitationHover = (ids: string[]) => {
    if (pinnedHighlightIds.length) return
    setHoverHighlightIds(ids)
  }

  const handleCitationLeave = () => {
    if (pinnedHighlightIds.length) return
    setHoverHighlightIds([])
  }

  const handleCitationClick = (ids: string[]) => {
    setPinnedHighlightIds(ids)
    setHoverHighlightIds([])
    panToBlocks(ids)
  }

  const handleClearHighlight = () => {
    setPinnedHighlightIds([])
    setHoverHighlightIds([])
  }

  const persistCanvasSummary = (summary: CanvasSummaryData | null) => {
    if (!summary) {
      window.localStorage.removeItem(PANEL_CANVAS_KEY)
      return
    }
    try {
      window.localStorage.setItem(PANEL_CANVAS_KEY, JSON.stringify(summary))
    } catch (err) {
      console.warn('Failed to persist canvas summary', err)
    }
  }

  const handlePanelResizeStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    panelResizeRef.current = { startX: event.clientX, startWidth: panelWidth }
    window.addEventListener('pointermove', handlePanelResizeMove)
    window.addEventListener('pointerup', handlePanelResizeEnd)
  }

  const handlePanelResizeMove = (event: globalThis.PointerEvent) => {
    if (!panelResizeRef.current) return
    const delta = panelResizeRef.current.startX - event.clientX
    const nextWidth = Math.min(
      SUMMARY_PANEL_MAX_WIDTH,
      Math.max(SUMMARY_PANEL_MIN_WIDTH, panelResizeRef.current.startWidth + delta)
    )
    setPanelWidth(nextWidth)
  }

  const handlePanelResizeEnd = () => {
    panelResizeRef.current = null
    window.removeEventListener('pointermove', handlePanelResizeMove)
    window.removeEventListener('pointerup', handlePanelResizeEnd)
  }

  const generateQaAnswer = (
    question: string,
    scopeIds: string[],
    summaryText: string,
    spans: SummarySpan[] | undefined,
    summaryCitations: { n: number; blockIds: string[] }[] | undefined
  ): { answer: string; citations: { n: number; blockIds: string[] }[] } => {
    const normQuestion = question.trim().toLowerCase()
    if (!normQuestion) return { answer: '', citations: [] }
    const scopeSet = new Set(scopeIds)
    const citationMap = new Map<number, string[]>()
    ;(summaryCitations ?? []).forEach((c) => {
      citationMap.set(c.n, c.blockIds.filter((id) => scopeSet.has(id)))
    })

    const lines = summaryText.split('\n')
    let offset = 0
    const lineEntries = lines.map((line) => {
      const start = offset
      const end = offset + line.length
      offset += line.length + 1
      const matchedSpans = (spans ?? []).filter((s) => !(s.end < start || s.start > end))
      const citationNs = matchedSpans.flatMap((s) => s.citationNs)
      const blockIds = citationNs.flatMap((n) => citationMap.get(n) ?? []).filter((id) => scopeSet.has(id))
      return { line, citationNs, blockIds }
    })

    const pickByKeywords = (keywords: string[]) =>
      lineEntries.filter((e) => keywords.some((k) => e.line.toLowerCase().includes(k)))

    const answers: { text: string; blockIds: string[] }[] = []
    const add = (text: string, blockIds: string[]) => {
      const ids = blockIds.filter((id) => scopeSet.has(id))
      answers.push({ text, blockIds: ids.length ? ids : scopeIds.slice(0, 1) })
    }

    const isGoalIntent = (() => {
      const phrases = [
        'main goal',
        'the goal',
        'goal',
        'purpose',
        'aim',
        'objective',
        'intended outcome',
        'success criteria',
        'what are we trying to do',
        'what is this for',
        'why are we doing',
        'why do this',
      ]
      return phrases.some((p) => normQuestion.includes(p))
    })()

    if (isGoalIntent) {
      const goalLines = lineEntries.filter((e) =>
        /(what this seems to be about|what this file seems to be about|goal|purpose|objective|aim)/i.test(e.line)
      )
      if (goalLines.length) {
        goalLines.slice(0, 2).forEach((e) => add(e.line, e.blockIds))
      } else {
        const fallbackIds = scopeIds.length ? scopeIds.slice(0, 2) : []
        add('The main goal is not stated explicitly in the selected blocks.', fallbackIds)
      }
    } else if (/what.*about|core idea|orientation|one sentence/i.test(normQuestion)) {
      const about = pickByKeywords(['what this seems to be about'])
      const picked = about.length ? about.slice(0, 2) : lineEntries.slice(0, 2)
      picked.forEach((e) => add(e.line, e.blockIds))
    } else if (/decision|decisions|postponed|avoided|care/i.test(normQuestion)) {
      const dec = pickByKeywords(['decision', 'tension'])
      if (dec.length) dec.slice(0, 4).forEach((e) => add(e.line, e.blockIds))
      else add('Not enough decision signals in this scope.', scopeIds.slice(0, 2))
    } else if (/constraint|assumption|conflict/i.test(normQuestion)) {
      const cons = pickByKeywords(['constraint', 'assumption'])
      if (cons.length) cons.slice(0, 4).forEach((e) => add(e.line, e.blockIds))
      else add('No explicit constraints found in this scope.', scopeIds.slice(0, 2))
    } else if (/where.*start|which block|minimum.*read/i.test(normQuestion)) {
      const refs = pickByKeywords(['best blocks', 'read next'])
      const chosen = refs.length ? refs : lineEntries.slice(0, 3)
      chosen.slice(0, 3).forEach((e) => add(e.line, e.blockIds))
    } else if (/missing|underspecified|gap|conflict/i.test(normQuestion)) {
      const gaps = pickByKeywords(['open questions', 'gaps', 'underspecified', 'fragile', 'risky'])
      if (gaps.length) gaps.slice(0, 3).forEach((e) => add(e.line, e.blockIds))
      else add('Gaps are not clearly stated in this scope.', scopeIds.slice(0, 2))
    } else if (/shorten|condense/i.test(normQuestion)) {
      const concise = lineEntries.filter((e) => e.line.startsWith('•')).slice(0, 3)
      concise.forEach((e) => add(e.line.replace(/^•\s*/, ''), e.blockIds))
    } else if (/expand|rephrase|checklist/i.test(normQuestion)) {
      const base = lineEntries.filter((e) => e.line.startsWith('•')).slice(0, 4)
      base.forEach((e) => add(e.line.replace(/^•\s*/, ''), e.blockIds))
    } else {
      add('I can help with summarizing, extracting, refocusing, navigating, or identifying gaps in this file.', scopeIds.slice(0, 1))
    }

    if (!answers.length) {
      return {
        answer: 'Not enough information in the current scope to answer.',
        citations: [{ n: 1, blockIds: scopeIds.slice(0, 2) }],
      }
    }

    const citationNumberMap = new Map<string, number>()
    let num = 1
    const ensureNum = (ids: string[]) => {
      const key = Array.from(new Set(ids)).sort().join('|')
      const existing = citationNumberMap.get(key)
      if (existing) return existing
      citationNumberMap.set(key, num)
      num += 1
      return citationNumberMap.get(key) as number
    }

    const linesOut = answers.map((a) => {
      const n = ensureNum(a.blockIds)
      return `• ${a.text} [${n}]`
    })

    const citations = Array.from(citationNumberMap.entries()).map(([key, n]) => ({
      n,
      blockIds: key ? key.split('|') : [],
    }))

    return { answer: linesOut.join('\n'), citations }
  }

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setPinnedHighlightIds([])
      setHoverHighlightIds([])
    }
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

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!selection.active || selection.pointerId !== event.pointerId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / zoom
    const y = (event.clientY - rect.top) / zoom
    setSelection((prev) => ({ ...prev, currentX: x, currentY: y }))
  }

  const handleCanvasPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const persistSelectionSummary = (summary: SummaryBlock | null) => {
    if (!summary) {
      window.localStorage.removeItem(PANEL_SELECTION_KEY)
      return
    }
    try {
      window.localStorage.setItem(PANEL_SELECTION_KEY, JSON.stringify(summary))
    } catch (err) {
      console.warn('Failed to persist selection summary', err)
    }
  }

  const panToBlocks = (ids: string[]) => {
    if (!ids.length) return
    const targetBlocks = blocks.filter((b) => ids.includes(b.id))
    if (!targetBlocks.length) return
    const minX = Math.min(...targetBlocks.map((b) => b.x))
    const maxX = Math.max(...targetBlocks.map((b) => b.x + b.width))
    const minY = Math.min(...targetBlocks.map((b) => b.y))
    const maxY = Math.max(...targetBlocks.map((b) => b.y + getBlockHeight(b)))
    ensureRectInView({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    })
  }

  const addSummaryRefBlock = () => {
    const summary = panelSummary ?? canvasSummary
    if (!summary) return
    const scrollEl = scrollRef.current
    const viewCenter = scrollEl
      ? {
          x: scrollEl.scrollLeft / zoom + scrollEl.clientWidth / (2 * zoom),
          y: scrollEl.scrollTop / zoom + scrollEl.clientHeight / (2 * zoom),
        }
      : { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
    const width = 360
    const height = 180
    const previewLines = summary.summaryText
      ? summary.summaryText.split('\n').filter((l) => l.trim().startsWith('•'))
      : []
    const previewText = previewLines.slice(0, 2).join('\n') || summary.summaryText.slice(0, 180)
    const pastelColor = pickPastelColor(summary.id)
    const block: Block = {
      id: createId('SREF'),
      type: 'summary_ref',
      x: Math.max(0, Math.min(viewCenter.x - width / 2, CANVAS_WIDTH - width)),
      y: Math.max(0, Math.min(viewCenter.y - height / 2, CANVAS_HEIGHT - height)),
      width,
      height,
      summaryId: summary.id,
      title: summary.title,
      preview: previewText,
      scopeBlockIds: summary.scope.blockIds,
      pastelColor,
      createdAt: Date.now(),
    }
    setBlocks((prev) => [...prev, block])
  }

  const handleSummarize = () => {
    const selected = getSelectedBlocks()
    if (selected.length < 1 || !selectionBounds || hasSummaryRefSelected) return
    const content = summarizeSelection(selected)
    const summarySize = { width: 360, height: 260 }
    const newSummary: SummaryBlock = {
      id: createId('SUM'),
      type: 'summary',
      title: content.title,
      sections: undefined,
      evidenceBlockIds: content.evidenceBlockIds,
      summaryText: content.summaryText,
      citations: content.citations,
      spans: content.spans,
      scope: { kind: 'selection', blockIds: selected.map((b) => b.id) },
      qa: [],
      messages: [],
      x: 0,
      y: 0,
      width: summarySize.width,
      height: summarySize.height,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setPanelSummary(newSummary)
    setCanvasSummary(null)
    setQaQuestion('')
    persistSelectionSummary(newSummary)
    setPanelOpen(true)
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
            className="summarize-canvas-btn"
            onClick={() => {
              setPanelSummary(null)
              const summary = generateCanvasSummary(blocks)
              setCanvasSummary(summary)
              setQaQuestion('')
              persistCanvasSummary(summary)
              setPanelOpen(true)
            }}
          >
            Summarize canvas
          </button>
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
        {selectionBounds && selectedIds.length >= 1 && !hasSummaryRefSelected && (
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
            highlight={activeHighlightSet.has(block.id)}
            dimmed={activeHighlightSet.size > 0 && !activeHighlightSet.has(block.id)}
            zoom={zoom}
            onPositionChange={handlePositionChange}
            onUpdate={handleUpdateBlock}
            onDelete={(id) => deleteBlocks([id])}
            onSelect={(clickedBlock, mode) => {
              if (clickedBlock.type === 'summary_ref') {
                const targetIds = [clickedBlock.id, ...clickedBlock.scopeBlockIds]
                const isSamePinned =
                  pinnedHighlightIds.length === targetIds.length &&
                  targetIds.every((id) => pinnedHighlightIds.includes(id))
                if (isSamePinned) {
                  setPinnedHighlightIds([])
                  setHoverHighlightIds([])
                  setSelectedIds([])
                } else {
                  setPinnedHighlightIds(targetIds)
                  setHoverHighlightIds([])
                  setSelectedIds([clickedBlock.id])
                  panToBlocks(clickedBlock.scopeBlockIds)
                }
                return
              }
              if (mode === 'single') {
                setSelectedIds([clickedBlock.id])
              } else {
                setSelectedIds((prev) =>
                  prev.includes(clickedBlock.id) ? prev.filter((existing) => existing !== clickedBlock.id) : [...prev, clickedBlock.id]
                )
              }
            }}
            lookupBlock={(id) => blockLookup.get(id)}
            onCitationHover={handleCitationHover}
            onCitationLeave={handleCitationLeave}
            onCitationClick={handleCitationClick}
            onClearHighlight={handleClearHighlight}
            hasPinnedHighlight={pinnedHighlightIds.length > 0}
            activeHighlightIds={activeHighlightIds}
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
      {panelOpen && (panelSummary || canvasSummary) && (
        <aside className="summary-panel" style={{ width: `${panelWidth}px` }}>
          <div
            className="summary-panel-resize"
            onPointerDown={handlePanelResizeStart}
            role="separator"
            aria-label="Resize summary panel"
          />
          <div className="summary-panel-header">
            <div className="summary-panel-title">
              <span className="summary-badge">Summary</span>
              <h3>{panelSummary ? panelSummary.title : 'Canvas summary'}</h3>
              {canvasSummary && <p className="summary-subtitle">Summary of {canvasSummary.totalBlocks} blocks</p>}
            </div>
            <div className="summary-panel-actions">
              <button
                className="summary-add-btn"
                disabled={!activeSummary}
                onClick={() => addSummaryRefBlock()}
              >
                Add block
              </button>
              <button
                className="summary-panel-close"
                onClick={() => {
                  setPanelSummary(null)
                  setCanvasSummary(null)
                  setQaQuestion('')
                  persistSelectionSummary(null)
                  setPanelOpen(false)
                }}
              >
                Close
              </button>
            </div>
          </div>
          <div className="summary-scroll">
            {panelSummary && (
              <div className="summary-panel-body">
                {(panelSummary.summaryText || '').split('\n').map((line, idx) => (
                  <p className="summary-text" key={idx}>
                    {line}
                  </p>
                ))}
              </div>
            )}
            {canvasSummary && (
              <div className="summary-panel-body">
                {Object.entries(canvasSummary.sections).map(([heading, value]) => (
                  <div className="summary-section" key={heading}>
                    <p className="summary-label">{heading}</p>
                    <p className="summary-text">{value}</p>
                  </div>
                ))}
              </div>
            )}
            {activeSummary && (
              <>
                <div className="summary-chat-divider labeled">
                  <span className="summary-label">
                    Ask about this {activeSummary.scope.kind === 'selection' ? 'selection' : 'canvas'}
                  </span>
                </div>
                <div className="summary-qa-list">
                  {activeMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`summary-qa-item ${msg.role === 'user' ? 'user' : 'assistant'}`}
                    >
                      <p className="summary-qa-label">{msg.role === 'user' ? 'You' : 'Recap'}</p>
                      <p className="summary-qa-answer">
                        {msg.role === 'assistant'
                          ? renderTextWithCitations(
                              msg.text,
                              'citations' in msg ? msg.citations : []
                            )
                          : msg.text}
                      </p>
                      {'citations' in msg && msg.citations?.length > 0 && (
                        <div className="summary-citations">
                          {msg.citations.map((c) => (
                            <CitationChip key={c.n} citation={c} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
              </>
            )}
          </div>
          {(panelSummary || canvasSummary) && (
            <div className="summary-qa">
              <div className="summary-qa-input">
                <input
                  type="text"
                  placeholder={
                    panelSummary
                      ? `Ask about these ${panelSummary.scope.blockIds.length} blocks...`
                      : 'Ask about the canvas...'
                  }
                  value={qaQuestion}
                  onChange={(e) => setQaQuestion(e.target.value)}
                />
                <button
                  onClick={() => {
                    if (!qaQuestion.trim()) return
                    const userMessage = {
                      id: createId('MSG'),
                      role: 'user' as const,
                      text: qaQuestion.trim(),
                      createdAt: Date.now(),
                    }
                    const thinkingMessage = {
                      id: createId('MSG'),
                      role: 'assistant' as const,
                      text: 'Thinking…',
                      citations: [] as { n: number; blockIds: string[] }[],
                      createdAt: Date.now(),
                    }
                    if (panelSummary) {
                      const messages = [...(panelSummary.messages ?? []), userMessage, thinkingMessage]
                      const updated = { ...panelSummary, messages }
                      setPanelSummary(updated)
                      persistSelectionSummary(updated)
                    } else if (canvasSummary) {
                      const messages = [...(canvasSummary.messages ?? []), userMessage, thinkingMessage]
                      const updated = { ...canvasSummary, messages }
                      setCanvasSummary(updated)
                      persistCanvasSummary(updated)
                    }
                    const targetSummary = panelSummary ?? canvasSummary
                    if (!targetSummary) return
                    const targetScope = targetSummary.scope
                    const { answer, citations } = generateQaAnswer(
                      qaQuestion,
                      targetScope.blockIds,
                      targetSummary.summaryText,
                      targetSummary.spans,
                      targetSummary.citations
                    )
                    if (!answer) return
                    setQaQuestion('')
                    const assistantMessage = {
                      id: createId('MSG'),
                      role: 'assistant' as const,
                      text: answer,
                      citations,
                      createdAt: Date.now(),
                    }
                    if (panelSummary) {
                      const updatedMessages = [
                        ...(panelSummary.messages ?? []).slice(0, -1),
                        assistantMessage,
                      ]
                      const updated = { ...panelSummary, messages: updatedMessages }
                      setPanelSummary(updated)
                      persistSelectionSummary(updated)
                    } else if (canvasSummary) {
                      const updatedMessages = [...(canvasSummary.messages ?? []).slice(0, -1), assistantMessage]
                      const updated = { ...canvasSummary, messages: updatedMessages }
                      setCanvasSummary(updated)
                      persistCanvasSummary(updated)
                    }
                  }}
                >
                  Ask
                </button>
            </div>
          </div>
        )}
        </aside>
      )}
    </div>
  )
}
