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
    id: 'T-301',
    type: 'text',
    text: 'Early concept: an interactive workshop where participants explore light through movement, reflection, and color. The experience should feel open-ended and playful rather than instructional, encouraging people to learn through experimentation.',
    x: 360,
    y: 240,
    width: 420,
    height: 180,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-302',
    type: 'text',
    text: 'Open question: should participants receive light prompts or challenges (e.g. “try moving together”, “observe reflections”) or should the space remain completely unguided to preserve a sense of discovery?',
    x: 360,
    y: 480,
    width: 420,
    height: 180,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-303',
    type: 'text',
    text: 'Constraint: the installation should be modular and portable, allowing it to be set up in different venues (museums, festivals, workshops) with minimal technical overhead and no permanent construction.',
    x: 360,
    y: 760,
    width: 420,
    height: 200,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'IMG-82',
    type: 'image',
    src: 'https://i.pinimg.com/736x/c4/c0/61/c4c061e511152c34718ede2238c5fa1c.jpg',
    x: 1280,
    y: 220,
    width: 360,
    height: 320,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'L-22',
    type: 'link',
    label: 'teamLab Borderless (Tokyo) — immersive digital art exhibition',
    url: 'https://www.teamlab.art/e/borderless/',
    x: 1280,
    y: 620,
    width: 360,
    height: 140,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'T-304',
    type: 'text',
    text: `MEETING NOTES (raw, unfiltered)

Workshop idea: light + movement + space (ref teamLab Borderless but NOT copying it).

Stakeholder keeps saying “no instructions” but also worried about people feeling stupid or lost. There was a comment about museums vs workshops — museums can afford ambiguity, workshops maybe less so? Not resolved.

Someone mentioned onboarding parallels: “if users don’t know what to do, that’s on the system, not them” — interesting tension bc here confusion might actually be intentional / desirable.

Notes on interaction ideas (very rough):
– light reacts slower than expected → teaches patience
– groups produce different effects than individuals
– standing still = more change than moving fast

Question came up: do people need to learn anything explicitly or is the experience enough on its own? One stakeholder wants a “reflection moment” at the end, another says that ruins the magic.

Practical stuff:
– must work in different rooms, ceiling heights unknown
– mirrored surfaces fragile? safety concern?
– power + sensors need to be hidden but accessible

I wrote down: “system teaches through feedback, not language” — feels like the core idea but not sure yet.

Someone asked if facilitators should nudge participants if they’re stuck. No decision.

Risk: people walk through, take photos, leave without engaging → then it’s just Instagram art. How to slow them down?

Possible constraint from legal / venue: no complete darkness (emergency exits must stay visible).

End of meeting: action item = explore how much ambiguity is too much. No clear next step.`,
    x: 900,
    y: 840,
    width: 520,
    height: 320,
    createdAt: now,
    updatedAt: now,
  },
]
