export type BlockType = 'text' | 'image' | 'link' | 'summary'

export type BlockBase = {
  id: string
  type: BlockType
  x: number
  y: number
  width: number
  height?: number
  createdAt: string
  updatedAt: string
}

export type TextBlock = BlockBase & {
  type: 'text'
  text: string
}

export type ImageBlock = BlockBase & {
  type: 'image'
  src: string
  caption?: string
}

export type LinkBlock = BlockBase & {
  type: 'link'
  url: string
  label: string
}

export type SummarySections = {
  what: string
  decisions: string
  constraints: string
  assumptions: string
}

export type SummaryBlock = BlockBase & {
  type: 'summary'
  title: string
  sections: SummarySections
  evidenceBlockIds: string[]
}

export type Block = TextBlock | ImageBlock | LinkBlock | SummaryBlock

export function createId(prefix = 'BLK'): string {
  const rand = Math.random().toString(16).slice(2, 6)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

const now = new Date().toISOString()

export const seedBlocks: Block[] = [
  {
    id: 'T-201',
    type: 'text',
    text: 'Decision draft: show bank list first, but uncertainty on whether to surface “Search by bank” vs “Connect with Plaid” as default.',
    x: 160,
    y: 180,
    width: 360,
    height: 140,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-202',
    type: 'text',
    text: 'Open question: error path for failed OAuth—should we retry inline or send users to support article?',
    x: 160,
    y: 380,
    width: 360,
    height: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'IMG-41',
    type: 'image',
    src: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=600&q=80',
    caption: 'Flow mock: account linking screen with bank list + fallback CTA.',
    x: 620,
    y: 220,
    width: 320,
    height: 260,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'L-14',
    type: 'link',
    label: 'PM feedback: concern about drop-off if bank search is hidden',
    url: 'https://example.com/pm-feedback-bank-search',
    x: 160,
    y: 560,
    width: 380,
    height: 110,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-203',
    type: 'text',
    text: 'Constraint: legal requires explicit consent copy before redirecting to any bank OAuth provider.',
    x: 620,
    y: 520,
    width: 360,
    height: 120,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-204',
    type: 'text',
    text: 'Open question: tradeoff between inline retry for failed OAuth vs deep link to support article.',
    x: 160,
    y: 760,
    width: 360,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-205',
    type: 'text',
    text: 'Decision draft: keep consent copy on the same screen as bank selection to reduce drop-off, but tentative.',
    x: 620,
    y: 760,
    width: 360,
    createdAt: now,
    updatedAt: now,
  },
]
