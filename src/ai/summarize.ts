import type { Block, Citation, SummarySpan, TextBlock, LinkBlock } from '../models/canvas'

export type SummaryContent = {
  title: string
  summaryText: string
  citations: Citation[]
  spans: SummarySpan[]
  evidenceBlockIds: string[]
}

type Bullet = { section: string; text: string; blockIds: string[] }

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()
const truncateWords = (text: string, maxWords = 24) => {
  const words = normalize(text).split(' ')
  if (words.length <= maxWords) return words.join(' ')
  return `${words.slice(0, maxWords).join(' ')}…`
}

function splitCandidates(text: string): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  return cleaned.split(/(?<=[.!?])\s+|;|\n/).map((s) => s.trim()).filter(Boolean)
}

function dedupe(lines: Bullet[]): Bullet[] {
  const seen = new Set<string>()
  const result: Bullet[] = []
  for (const b of lines) {
    const key = `${b.section}|${normalize(b.text).toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(b)
  }
  return result
}

function pickTop(lines: Bullet[], limit: number): Bullet[] {
  return lines.slice(0, limit)
}

export function summarizeSelection(blocks: Block[]): SummaryContent {
  const evidenceBlockIds = blocks.map((b) => b.id)
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text')
  const linkBlocks = blocks.filter((b): b is LinkBlock => b.type === 'link')

  const candidates: Array<{ text: string; blockId: string; tags: string[] }> = []

  const stripMetadata = (text: string) =>
    text.replace(/voice note transcription.*?:/gi, '').replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/gi, '').trim()

  textBlocks.forEach((b) => {
    splitCandidates(stripMetadata(b.text)).forEach((line) => {
      const lower = line.toLowerCase()
      const tags: string[] = []
      if (/decision|decided|choose|draft/i.test(lower)) tags.push('decision')
      if (/constraint|must|require|cannot|limit|portable|modular|no\s+complete\s+darkness/i.test(lower)) tags.push('constraint')
      if (/risk|concern|drop-off|fragile|safety/i.test(lower)) tags.push('risk')
      if (/open question|question|uncertain|not sure|tension|how do|should/i.test(lower)) tags.push('question')
      if (/audience|kids|adults|people/i.test(lower)) tags.push('audience')
      candidates.push({ text: line, blockId: b.id, tags })
    })
  })

  linkBlocks.forEach((b) => {
    candidates.push({ text: `${b.label} (${b.url})`, blockId: b.id, tags: ['reference'] })
  })

  // Section 1: What this seems to be about
  const aboutCandidates = candidates.filter((c) => c.tags.length === 0 || c.tags.includes('reference'))
  const aboutText = aboutCandidates.slice(0, 2).map((c) => ({
    section: 'What this seems to be about',
    text: truncateWords(c.text, 20),
    blockIds: [c.blockId],
  }))

  // Section 2: Key tensions / open questions
  const tensionCandidates = candidates.filter((c) => c.tags.some((t) => t === 'decision' || t === 'risk' || t === 'constraint' || t === 'question'))
  const groupedTensions = tensionCandidates.length
    ? [
        {
          section: 'Key tensions / open questions',
          text: truncateWords(
            tensionCandidates
              .slice(0, 4)
              .map((c) => c.text)
              .join('; '),
            28
          ),
          blockIds: tensionCandidates.slice(0, 4).map((c) => c.blockId),
        },
      ]
    : []

  // Section 3: Secondary considerations
  const audience = candidates.filter((c) => c.tags.includes('audience'))
  const constraints = candidates.filter((c) => c.tags.includes('constraint'))
  const secondary: Bullet[] = []
  if (audience.length) {
    secondary.push({
      section: 'Secondary considerations',
      text: truncateWords(audience.map((c) => c.text).join('; '), 22),
      blockIds: audience.map((c) => c.blockId),
    })
  }
  if (constraints.length) {
    secondary.push({
      section: 'Secondary considerations',
      text: truncateWords(constraints.map((c) => c.text).join('; '), 22),
      blockIds: constraints.map((c) => c.blockId),
    })
  }

  // Section 4: Best blocks to read next
  const evidenceEntries: Bullet[] = blocks
    .filter((b) => b.type === 'text' || b.type === 'link')
    .slice(0, 3)
    .map((b) => ({
      section: 'Best blocks to read next',
      text: b.type === 'text' ? `${b.id}: primary notes` : `${b.id}: reference link`,
      blockIds: [b.id],
    }))

  const allBullets = dedupe([...aboutText, ...groupedTensions, ...secondary, ...evidenceEntries])

  // Build structured text by section order
  const sectionOrder = [
    'What this seems to be about',
    'Key tensions / open questions',
    'Secondary considerations',
    'Best blocks to read next',
  ]

  const orderedLines: string[] = []
  const spans: SummarySpan[] = []
  const citationMap = new Map<string, number>()
  let citationCounter = 1
  const ensureCitationNumber = (blockIds: string[]) => {
    const unique = Array.from(new Set(blockIds)).sort()
    const key = unique.join('|')
    const existing = citationMap.get(key)
    if (existing) return existing
    citationMap.set(key, citationCounter)
    citationCounter += 1
    return citationMap.get(key) as number
  }

  let offset = 0
  sectionOrder.forEach((section) => {
    const lines = allBullets.filter((b) => b.section === section)
    if (!lines.length) return
    orderedLines.push(`${section}:`)
    offset += `${section}:`.length + 1
    pickTop(lines, section === 'Key tensions / decisions in progress' ? 4 : 3).forEach((b) => {
      const line = `• ${b.text}`
      orderedLines.push(line)
      const citationNs = [ensureCitationNumber(b.blockIds)]
      spans.push({
        start: offset,
        end: offset + line.length,
        citationNs,
      })
      offset += line.length + 1
    })
  })

  if (!orderedLines.length) {
    orderedLines.push('Not enough information from the selected artifacts.')
    spans.push({ start: 0, end: orderedLines[0].length, citationNs: [1] })
    citationMap.set(blocks[0]?.id ?? 'unknown', 1)
  }

  const summaryText = orderedLines.join('\n')
  const citations: Citation[] = Array.from(citationMap.entries())
    .map(([key, n]) => ({ n, blockIds: key.split('|') }))
    .sort((a, b) => a.n - b.n)

  const title = `Summary of ${blocks.length} artifact${blocks.length === 1 ? '' : 's'}`

  return {
    title,
    summaryText,
    citations,
    spans,
    evidenceBlockIds,
  }
}
