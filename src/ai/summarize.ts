import type { Block, Citation, SummarySpan, TextBlock, LinkBlock } from '../models/canvas'

export type SummaryContent = {
  title: string
  summaryText: string
  citations: Citation[]
  spans: SummarySpan[]
  evidenceBlockIds: string[]
}

type Bullet = { text: string; blockIds: string[] }

const shorten = (text: string, max = 180) => {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function summarizeSelection(blocks: Block[]): SummaryContent {
  const evidenceBlockIds = blocks.map((b) => b.id)
  const textBlocks = blocks.filter((b): b is TextBlock => b.type === 'text')
  const linkBlocks = blocks.filter((b): b is LinkBlock => b.type === 'link')

  const findMatchingTextBlocks = (regex: RegExp) => textBlocks.filter((b) => regex.test(b.text))

  const bullets: Bullet[] = []

  // Concept / intent
  const concept = textBlocks[0]
  if (concept) {
    bullets.push({ text: `Concept: ${shorten(concept.text, 140)}`, blockIds: [concept.id] })
  }

  // Open questions / tensions
  const questionBlocks = findMatchingTextBlocks(/open question|question|tension|how do|should|not sure|uncertainty/i)
  questionBlocks.slice(0, 2).forEach((b) => {
    bullets.push({ text: shorten(b.text, 200), blockIds: [b.id] })
  })

  // Constraints
  const constraintBlocks = findMatchingTextBlocks(/constraint|must|requires|no complete darkness|cannot|portable|modular/i)
  if (constraintBlocks.length) {
    constraintBlocks.slice(0, 2).forEach((b) => {
      bullets.push({ text: `Constraints/requirements: ${shorten(b.text, 180)}`, blockIds: [b.id] })
    })
  }

  // Risks / practical notes from any remaining text blocks
  const practicalBlocks = textBlocks.filter(
    (b) => !questionBlocks.includes(b) && !constraintBlocks.includes(b) && b !== concept
  )
  practicalBlocks.slice(0, 2).forEach((b) => {
    bullets.push({ text: `Practical notes: ${shorten(b.text, 180)}`, blockIds: [b.id] })
  })

  // References
  linkBlocks.slice(0, 2).forEach((b) => {
    bullets.push({ text: `Reference: ${shorten(`${b.label} (${b.url})`, 160)}`, blockIds: [b.id] })
  })

  // Fallback if too few bullets
  if (bullets.length < 4) {
    bullets.push({
      text: 'Not enough information from the selected artifacts.',
      blockIds: [blocks[0]?.id ?? 'unknown'],
    })
  }

  const uniqueSet = new Set<string>()
  const uniqueBullets = bullets.filter((b) => {
    const key = `${b.text}|${b.blockIds.join(',')}`
    if (uniqueSet.has(key)) return false
    uniqueSet.add(key)
    return true
  })

  const limitedBullets = uniqueBullets.slice(0, 8)

  // Build citations map
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
  const spans: SummarySpan[] = []
  const lines: string[] = []

  limitedBullets.forEach((bullet) => {
    const line = `• ${bullet.text}`
    lines.push(line)
    const citationNs = [ensureCitationNumber(bullet.blockIds)]
    spans.push({
      start: offset,
      end: offset + line.length,
      citationNs,
    })
    offset += line.length + 1 // account for newline
  })

  const summaryText = lines.join('\n')
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
