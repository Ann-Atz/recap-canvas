import type { Block, SummarySections } from '../models/canvas'

export type SummaryContent = {
  title: string
  sections: SummarySections
  evidenceBlockIds: string[]
}

const FALLBACK_NOT_ENOUGH = 'Not enough information from the selected blocks.'

function collectText(blocks: Block[]): string[] {
  const texts: string[] = []
  blocks.forEach((block) => {
    if (block.type === 'text') texts.push(block.text)
    if (block.type === 'image' && block.caption) texts.push(block.caption)
    if (block.type === 'link') texts.push(`${block.label} (${block.url})`)
    if (block.type === 'summary') {
      texts.push(block.title)
      texts.push(block.sections.what)
      texts.push(block.sections.decisions)
      texts.push(block.sections.constraints)
      texts.push(block.sections.assumptions)
    }
  })
  return texts
}

function firstNonEmpty(values: string[], fallback = FALLBACK_NOT_ENOUGH): string {
  const found = values.map((v) => v.trim()).find((v) => v.length > 0)
  return found ?? fallback
}

function deriveDecisions(blocks: Block[]): string {
  const decisions: string[] = []
  blocks.forEach((block) => {
    if (block.type === 'text' && /decision/i.test(block.text)) decisions.push(block.text)
    if (block.type === 'summary' && block.sections.decisions) decisions.push(block.sections.decisions)
  })
  if (decisions.length === 0) return FALLBACK_NOT_ENOUGH
  return decisions.join(' ')
}

export function summarizeSelection(blocks: Block[]): SummaryContent {
  const evidenceBlockIds = blocks.map((b) => b.id)
  const texts = collectText(blocks)

  const constraintHints = texts.filter((t) => /constraint|limit|blocked|compliance/i.test(t))
  const assumptionHints = texts.filter((t) => /assumption|question|\?/i.test(t))

  const what = firstNonEmpty(texts)
  const decisions = deriveDecisions(blocks)
  const constraints = firstNonEmpty(
    constraintHints.concat(
      blocks
        .filter((b) => b.type === 'summary')
        .map((b) => ('sections' in b ? b.sections.constraints : ''))
    )
  )
  const assumptions = firstNonEmpty(
    assumptionHints.concat(
      blocks
        .filter((b) => b.type === 'summary')
        .map((b) => ('sections' in b ? b.sections.assumptions : ''))
    )
  )

  const title = `Summary of ${blocks.length} artifact${blocks.length === 1 ? '' : 's'}`

  return {
    title,
    sections: {
      what: what,
      decisions,
      constraints,
      assumptions,
    },
    evidenceBlockIds,
  }
}
