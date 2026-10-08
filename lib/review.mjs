// What the review page decides without a DOM: which cards a filter leaves, in
// what order, what a verdict file says, what a link to the page carries. Plain
// JavaScript, so node tests it directly.
export const VERDICTS = [
  { v: 'real', label: 'Real', key: '1' },
  { v: 'unsure', label: 'Needs a look', key: '2' },
  { v: 'artifact', label: 'Artifact', key: '3' },
]

const EXPORT_COLUMNS = [
  'id',
  'line',
  'vcf_id',
  'chrom',
  'pos',
  'svtype',
  'size',
  'filter',
  'event',
  'genes',
  'impact',
  'change',
  'supporting_reads',
  'support',
  'verdict',
  'note',
]

export function storageKey(portalId) {
  return `variant-review:${portalId}`
}

export function sizeLabel(bp) {
  if (bp === undefined) {
    return ''
  }
  return bp >= 1e6
    ? `${(bp / 1e6).toFixed(1)} Mb`
    : bp >= 1e3
      ? `${(bp / 1e3).toFixed(1)} kb`
      : `${bp} bp`
}

export const FILTER_DEFAULTS = {
  cls: 'all',
  event: 'all',
  support: 'all',
  impact: 'all',
  verdictFilter: 'all',
  q: '',
}

export const FACET_PREFIX = 'facet:'

export function matches(card, { verdicts, ...given }) {
  const { cls, event, support, impact, verdictFilter, q } = {
    ...FILTER_DEFAULTS,
    ...given,
  }
  for (const [key, wanted] of Object.entries(given)) {
    if (
      key.startsWith(FACET_PREFIX) &&
      wanted !== 'all' &&
      card.facets?.[key.slice(FACET_PREFIX.length)] !== wanted
    ) {
      return false
    }
  }
  if (cls !== 'all' && card.cls !== cls) {
    return false
  }
  if (support !== 'all' && card.support !== support) {
    return false
  }
  if (impact !== 'all' && card.impact !== impact) {
    return false
  }
  if (event !== 'all' && card.event !== event) {
    return false
  }
  const v = verdicts[card.id] || ''
  if (verdictFilter === 'unreviewed' && v) {
    return false
  }
  if (
    verdictFilter !== 'all' &&
    verdictFilter !== 'unreviewed' &&
    v !== verdictFilter
  ) {
    return false
  }
  if (q) {
    const hay = [
      card.title,
      card.vcfId,
      card.event,
      ...card.locs,
      ...(card.genes ?? []),
      ...(card.effects ?? []),
      card.change,
      card.alleles,
      card.filter,
      ...Object.values(card.facets ?? {}),
    ]
      .join(' ')
      .toLowerCase()
    if (!q.trim().toLowerCase().split(/\s+/).every(word => hay.includes(word))) {
      return false
    }
  }
  return true
}

const sampleField = key => card => {
  const value = card.samples?.[0]?.fields.find(([k]) => k === key)?.[1]
  return typeof value === 'number' ? value : undefined
}

const SORTS = {
  size: card => card.size,
  reads: card => card.lanes?.[0]?.reads,
  control: card => {
    const counts = (card.lanes ?? [])
      .slice(1)
      .map(l => l.reads)
      .filter(n => n !== undefined)
    return counts.length ? Math.max(...counts) : undefined
  },
  qual: card => card.qual,
}

/**
 * The orders this callset can take: every key at least one card has a number
 * for. A FORMAT number of the first sample sorts as `format:AF`.
 */
export function sortOptions(cards) {
  const formatKeys = [
    ...new Set(
      cards.flatMap(c =>
        (c.samples?.[0]?.fields ?? [])
          .filter(([, value]) => typeof value === 'number')
          .map(([key]) => key),
      ),
    ),
  ]
  return [
    ['callset', 'Callset order'],
    ...[
      ['size', 'Largest first'],
      ['reads', 'Most supporting reads first'],
      ['control', 'Most control support first'],
      ['qual', 'Highest QUAL first'],
    ].filter(([key]) => cards.some(c => SORTS[key](c) !== undefined)),
    ...formatKeys.map(key => [`format:${key}`, `Highest ${key} first`]),
  ]
}

function reader(sort) {
  return sort.startsWith('format:')
    ? sampleField(sort.slice('format:'.length))
    : SORTS[sort]
}

/** The number a card is ordered on under `sort`, where it has one. */
export function sortValue(card, sort) {
  return reader(sort)?.(card)
}

/** Descending on the key; a card with no number for it keeps its place last. */
export function sortCards(cards, sort) {
  const read = reader(sort)
  if (!read) {
    return cards
  }
  return cards
    .map((card, i) => ({ card, i, value: read(card) }))
    .sort(
      (a, b) =>
        (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.i - b.i,
    )
    .map(({ card }) => card)
}

const HASH_DEFAULTS = { ...FILTER_DEFAULTS, sort: 'callset', view: 'cards', card: '' }

/**
 * The page's filters, order and cursor as a URL fragment, defaults left out, so
 * the address bar is always a link to what the reviewer is looking at.
 */
export function toHash(state) {
  const params = new URLSearchParams()
  for (const [key, fallback] of Object.entries(HASH_DEFAULTS)) {
    const value = state[key] ?? fallback
    if (value !== fallback) {
      params.set(key, value)
    }
  }
  for (const [key, value] of Object.entries(state)) {
    if (key.startsWith(FACET_PREFIX) && value !== 'all') {
      params.set(key, value)
    }
  }
  const text = params.toString()
  return text ? `#${text}` : ''
}

export function fromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  return Object.fromEntries([
    ...Object.entries(HASH_DEFAULTS).map(([key, fallback]) => [
      key,
      params.get(key) ?? fallback,
    ]),
    ...[...params].filter(([key]) => key.startsWith(FACET_PREFIX)),
  ])
}

// Only the cards this build carries. A rerun with a smaller --limit keeps the
// portalId, so earlier verdicts are still in storage: counting them reads as
// "16 of 12 judged", and dropping them throws away a review a wider rerun
// could still use.
export function tallyVerdicts(cards, verdicts) {
  const c = Object.fromEntries(VERDICTS.map(b => [b.v, 0]))
  for (const card of cards) {
    const v = verdicts[card.id]
    if (c[v] !== undefined) {
      c[v]++
    }
  }
  return c
}

/** `9` split reads, or `17/41` reads with the ALT of those covering it */
export function laneCount({ reads, depth }) {
  return reads === undefined
    ? ''
    : depth === undefined
      ? `${reads}`
      : `${reads}/${depth}`
}

// a note is one cell: a tab or a newline in it would shear the row
const cell = text => `${text ?? ''}`.replaceAll(/[\t\r\n]+/g, ' ')

export function toTsv(cards, verdicts, notes = {}) {
  const lines = [EXPORT_COLUMNS.join('\t')]
  for (const c of cards) {
    lines.push(
      [
        c.id,
        c.line ?? '',
        c.vcfId ?? '',
        c.chrom ?? '',
        c.pos ?? '',
        c.svtype ?? '',
        c.size ?? '',
        c.filter ?? '',
        c.event,
        (c.genes ?? []).join(','),
        c.impact ?? '',
        c.change ?? '',
        (c.lanes ?? [])
          .filter(l => l.reads !== undefined)
          .map(l => `${l.label}=${laneCount(l)}`)
          .join(';'),
        c.support,
        verdicts[c.id] || 'unreviewed',
        notes[c.id] ?? '',
      ]
        .map(cell)
        .join('\t'),
    )
  }
  return `${lines.join('\n')}\n`
}

// The other half of Export: verdicts live in one browser's localStorage, so
// without this a cleared site setting, a second reviewer or a second machine
// starts the queue from nothing.
export function fromTsv(text, cards) {
  const rows = text.split(/\r?\n/).filter(l => l.trim())
  const head = (rows.shift() || '').split('\t')
  const idAt = head.indexOf('id')
  const vAt = head.indexOf('verdict')
  const noteAt = head.indexOf('note')
  if (idAt === -1 || vAt === -1) {
    return { error: 'That file has no id and verdict columns.' }
  }
  const known = new Set(cards.map(c => c.id))
  const allowed = new Set(VERDICTS.map(b => b.v))
  const changes = {}
  const notes = {}
  let applied = 0
  let unknown = 0
  for (const line of rows) {
    const f = line.split('\t')
    const id = f[idAt]
    const v = f[vAt]
    if (!id) {
      continue
    }
    if (v === 'unreviewed' || v === '') {
      changes[id] = null
    } else if (allowed.has(v)) {
      changes[id] = v
    } else {
      continue
    }
    if (noteAt !== -1) {
      notes[id] = f[noteAt] ?? ''
    }
    if (known.has(id)) {
      applied++
    } else {
      unknown++
    }
  }
  return { changes, notes, applied, unknown }
}
