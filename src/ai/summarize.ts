import type { Block, SummarySections, TextBlock, ImageBlock, LinkBlock } from '../models/canvas'

export type SummaryContent = {
  title: string
  sections: SummarySections
  evidenceBlockIds: string[]
}

export function summarizeSelection(blocks: Block[]): SummaryContent {
  const evidenceBlockIds = blocks.map((b) => b.id)
  const lowerSignals = (text: string) => text.toLowerCase()
  const contentForBlock = (block: Block) => {
    if (block.type === 'text') return (block as TextBlock).text
    if (block.type === 'image') return (block as ImageBlock).caption ?? ''
    if (block.type === 'link') {
      const l = block as LinkBlock
      return `${l.label} ${l.url}`
    }
    if (block.type === 'summary') {
      return [
        block.title,
        block.sections.what,
        block.sections.decisions,
        block.sections.constraints,
        block.sections.assumptions,
      ].join(' ')
    }
    return ''
  }

  const signals = {
    decision: ['decision draft', 'decision', 'draft', 'we decided', 'tentative'],
    constraint: ['constraint', 'requires', 'must', 'cannot', 'legal', 'compliance'],
    question: ['open question', 'uncertainty', 'tbd', 'not sure', 'tradeoff', 'trade-off', 'risk', 'concern', '?'],
  }

  const hasSignal = (text: string, keys: string[]) => {
    const l = lowerSignals(text)
    return keys.some((k) => l.includes(k))
  }

  const decisionItems: string[] = []
  const constraintItems: string[] = []
  const questionItems: string[] = []
  const topicWords: string[] = []

  blocks.forEach((block) => {
    const text = contentForBlock(block).trim()
    if (!text) return
    if (hasSignal(text, signals.decision)) {
      const tentative = hasSignal(text, ['tentative', 'draft']) ? ' (Tentative)' : ''
      decisionItems.push(text + tentative)
    }
    if (hasSignal(text, signals.constraint)) {
      constraintItems.push(text)
    }
    if (hasSignal(text, signals.question)) {
      questionItems.push(text)
    }
    topicWords.push(text)
  })

  const generateWhat = () => {
    const corpus = topicWords.join(' ').toLowerCase()
    if (!corpus.trim()) return 'Not enough information from the selected artifacts.'
    const stop = new Set([
      'the','a','an','and','or','of','for','to','in','on','with','is','are','this','that','these','those','as','at','by','we','our','their','from','about',
    ])
    const freq: Record<string, number> = {}
    corpus.split(/[^a-z0-9]+/).forEach((word) => {
      if (!word || stop.has(word) || word.length < 3) return
      freq[word] = (freq[word] || 0) + 1
    })
    const top = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([w]) => w)
    if (top.length === 0) return 'Not enough information from the selected artifacts.'
    return `This area explores ${top.join(', ')}.`
  }

  const pickSection = (items: string[]) => {
    if (items.length === 0) return 'Not enough information from the selected artifacts.'
    return items.map((t) => t.replace(/\s+/g, ' ').trim()).join(' ')
  }

  const sections: SummarySections = {
    what: generateWhat(),
    decisions: pickSection(decisionItems),
    constraints: pickSection(constraintItems),
    assumptions: pickSection(questionItems),
  }

  const title = `Summary of ${blocks.length} artifact${blocks.length === 1 ? '' : 's'}`

  return {
    title,
    sections,
    evidenceBlockIds,
  }
}
