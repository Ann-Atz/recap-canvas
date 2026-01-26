// Minimal demo server with input caps, sanitization, and rate limiting safeguards for GPT usage.
require('dotenv').config()
const express = require('express')
const cors = require('cors')
const OpenAI = require('openai')

const app = express()
const PORT = 8787
const HOST = process.env.HOST || '127.0.0.1'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

app.use(
  cors({
    origin: ['http://localhost:5173'],
    methods: ['POST'],
  })
)
app.use(express.json({ limit: '1mb' }))

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000
const RATE_LIMIT_MAX = 10
const requestLog = new Map()

function isRateLimited(ip) {
  const now = Date.now()
  const entries = (requestLog.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)
  entries.push(now)
  requestLog.set(ip, entries)
  return entries.length > RATE_LIMIT_MAX
}

function sanitizeBlocks(rawBlocks) {
  if (!Array.isArray(rawBlocks)) return []
  return rawBlocks
    .map((b) => {
      const content = [b.text, b.caption, b.label, b.url].filter(Boolean).join(' ').trim()
      return {
        id: typeof b.id === 'string' ? b.id : '',
        type: typeof b.type === 'string' ? b.type : '',
        content,
      }
    })
    .filter((b) => b.id && b.type && b.content)
}

function buildUserMessage({ mode, blocks, userPrompt }) {
  const header = [
    `Mode: ${mode}`,
    userPrompt ? `User focus: ${userPrompt}` : null,
    'Provide the following structure:',
    '1) What this file seems to be about',
    '2) What’s been explored',
    '3) Things tentatively decided',
    '4) Constraints',
    '5) Open questions',
    '6) What’s missing / unclear',
    '7) Evidence (cite block IDs)',
    '',
    'Blocks:',
  ]
    .filter(Boolean)
    .join('\n')

  const blockLines = blocks.map((b) => `[${b.id}] ${b.type} ${b.content}`).join('\n')
  return `${header}\n${blockLines}`
}

async function generateSummary({ mode, blocks, userPrompt }) {
  const system = [
    'You are assisting a designer summarizing canvas artifacts.',
    'Use ONLY the provided block content; never invent facts or decisions.',
    'Surface uncertainty and gaps explicitly.',
    'Tone: concise, designer-to-designer.',
  ].join(' ')

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: buildUserMessage({ mode, blocks, userPrompt }) },
  ]

  // Prefer Responses API if available; fall back to chat.completions.
  if (openai.responses && typeof openai.responses.create === 'function') {
    const response = await openai.responses.create({
      model: MODEL,
      temperature: 0.2,
      input: messages,
    })
    const text = response.output_text
    if (!text) throw new Error('No summary returned')
    return text.trim()
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages,
  })
  const text = completion.choices?.[0]?.message?.content
  if (!text) throw new Error('No summary returned')
  return text.trim()
}

app.post('/api/summarize', async (req, res) => {
  const ip = req.ip || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }

  const { mode, blocks: rawBlocks, userPrompt } = req.body || {}
  if (!mode || (mode !== 'selection' && mode !== 'project')) {
    return res.status(400).json({ error: 'Invalid mode' })
  }

  if (!rawBlocks || !Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return res.status(400).json({ error: 'No blocks provided' })
  }

  const maxBlocks = mode === 'selection' ? 12 : 25
  if (rawBlocks.length > maxBlocks) {
    return res.status(400).json({ error: `Too many blocks (max ${maxBlocks})` })
  }

  const blocks = sanitizeBlocks(rawBlocks)
  if (blocks.length === 0) {
    return res.status(400).json({ error: 'No usable block content' })
  }

  const totalLength = blocks.reduce((sum, b) => sum + b.content.length, 0)
  if (totalLength > 10_000) {
    return res.status(400).json({ error: 'Input too long (max 10000 chars)' })
  }

  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not configured')
    return res.status(500).json({ error: 'OpenAI API key not configured' })
  }

  try {
    const summaryText = await generateSummary({ mode, blocks, userPrompt })
    return res.json({ summaryText })
  } catch (err) {
    console.error('Failed to generate summary', err)
    return res.status(500).json({ error: 'Failed to generate summary' })
  }
})

async function generateAnswer({ question, blocks }) {
  const system = [
    'You are assisting a designer answering a question about canvas artifacts.',
    'Use ONLY the provided block content; never invent facts or decisions.',
    'Be concise and cite block IDs inline where relevant.',
  ].join(' ')

  const header = ['Question:', question.trim(), '', 'Blocks:'].join('\n')
  const blockLines = blocks.map((b) => `[${b.id}] ${b.type} ${b.content}`).join('\n')
  const input = `${header}\n${blockLines}`

  if (openai.responses && typeof openai.responses.create === 'function') {
    const response = await openai.responses.create({
      model: MODEL,
      temperature: 0.2,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: input },
      ],
    })
    const text = response.output_text
    if (!text) throw new Error('No answer returned')
    return text.trim()
  }

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input },
    ],
  })
  const text = completion.choices?.[0]?.message?.content
  if (!text) throw new Error('No answer returned')
  return text.trim()
}

app.post('/api/ask', async (req, res) => {
  const ip = req.ip || 'unknown'
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded' })
  }
  const { question, blocks: rawBlocks } = req.body || {}
  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: 'Question required' })
  }
  if (!rawBlocks || !Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    return res.status(400).json({ error: 'No blocks provided' })
  }
  if (rawBlocks.length > 25) {
    return res.status(400).json({ error: 'Too many blocks (max 25)' })
  }
  const blocks = sanitizeBlocks(rawBlocks)
  if (!blocks.length) {
    return res.status(400).json({ error: 'No usable block content' })
  }
  const totalLength = blocks.reduce((sum, b) => sum + b.content.length, 0)
  if (totalLength > 10_000) {
    return res.status(400).json({ error: 'Input too long (max 10000 chars)' })
  }
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not configured')
    return res.status(500).json({ error: 'OpenAI API key not configured' })
  }
  try {
    const answerText = await generateAnswer({ question, blocks })
    return res.json({ answerText })
  } catch (err) {
    console.error('Failed to generate answer', err)
    return res.status(500).json({ error: 'Failed to generate answer' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`)
})
