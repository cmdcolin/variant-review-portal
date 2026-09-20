// What the review page decides without a DOM: which cards a filter leaves, what
// a verdict file says. Plain JavaScript, so node tests it directly.
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
  'verdict',
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

export function matches(card, { cls, event, verdictFilter, q, verdicts }) {
  if (cls !== 'all' && card.cls !== cls) {
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
    const hay =
      `${card.title} ${card.vcfId ?? ''} ${card.event} ${card.locs.join(' ')}`.toLowerCase()
    if (!hay.includes(q.trim().toLowerCase())) {
      return false
    }
  }
  return true
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

export function toTsv(cards, verdicts) {
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
        verdicts[c.id] || 'unreviewed',
      ].join('\t'),
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
  if (idAt === -1 || vAt === -1) {
    return { error: 'That file has no id and verdict columns.' }
  }
  const known = new Set(cards.map(c => c.id))
  const allowed = new Set(VERDICTS.map(b => b.v))
  const changes = {}
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
    if (known.has(id)) {
      applied++
    } else {
      unknown++
    }
  }
  return { changes, applied, unknown }
}
