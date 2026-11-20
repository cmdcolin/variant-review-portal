// The review page. One component tree, rendered twice: to a string when the
// portal is written, so the cards and their images are in the HTML before any
// script runs, and again in the browser to hydrate the parts that take input.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  FACET_PREFIX,
  FILTER_DEFAULTS,
  fromHash,
  fromTsv,
  matches,
  mergeEdits,
  sizeLabel,
  sortCards,
  sortOptions,
  sortValue,
  storageKey,
  unexported,
  tallyVerdicts,
  toHash,
  toTsv,
  VERDICTS,
} from './review.mjs'

const IMPACTS = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER']
const GENES_SHOWN = 4

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function facts(card) {
  if (card.kind === 'event') {
    return [plural(card.members, 'record'), `${card.locs.length} loci`]
  }
  return [
    card.svtype === '' ? card.alleles : card.svtype,
    sizeLabel(card.size),
    card.qual === undefined ? '' : `QUAL ${card.qual}`,
    card.eventType,
  ].filter(Boolean)
}

function geneLabel(card, shown = GENES_SHOWN) {
  const { genes } = card
  return genes.length > shown
    ? `${genes.slice(0, shown).join(' · ')} +${genes.length - shown}`
    : genes.join(' · ')
}

const isFailing = filter => !!filter && filter !== 'PASS' && filter !== '.'

function Filter({ card, describe }) {
  return isFailing(card.filter) ? (
    <span
      className="filter"
      title={card.filter
        .split(';')
        .map(f => describe.FILTER[f])
        .filter(Boolean)
        .join('\n')}
    >
      {card.filter.replaceAll('_', ' ').replaceAll(';', ', ')}
    </span>
  ) : null
}

function Lanes({ lanes }) {
  return lanes.some(l => l.reads !== undefined)
    ? lanes.map(l => (
        <span className="lane" key={l.label} data-zero={!l.reads}>
          <b>{l.label}</b>
          {l.reads === undefined
            ? 'not counted'
            : l.alt === undefined
              ? `${plural(l.split, 'split read')} joining the loci`
              : l.split === undefined
                ? `${l.alt} of ${plural(l.depth, 'read')} with the ALT`
                : `${l.split} split + ${l.alt} gapped of ${plural(l.depth, 'read')}`}
        </span>
      ))
    : null
}

// FILTER has a chip of its own, coloured as a warning
function Facets({ card, describe }) {
  return Object.entries(card.facets)
    .filter(([key]) => key !== 'FILTER')
    .map(([key, value]) => (
      <span
        className="facet"
        key={key}
        title={[describe.INFO[key], value.replaceAll('_', ' ')]
          .filter(Boolean)
          .join('\n\n')}
      >
        <b>{key}</b> {value.replaceAll('_', ' ')}
      </span>
    ))
}

function Fields({ rows, descriptions }) {
  return (
    <dl className="fields">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt title={descriptions[key]}>{key}</dt>
          <dd>{`${value}`}</dd>
        </div>
      ))}
    </dl>
  )
}

function Count({ count }) {
  return count ? (
    <span className="count-reads" data-zero={!count.reads}>
      {count.bases} {count.reads}
      <span className="dim">/{count.depth}</span>
    </span>
  ) : null
}

function TrioCalls({ card, describe }) {
  return (
    <div className="trio">
      {card.trio.why ? <p className="why">{card.trio.why}</p> : null}
      <table>
        <tbody>
          {card.trio.members.map(m => (
            <tr key={m.sample} data-role={m.role}>
              <th scope="row">
                {m.sample} <span className="rel">({m.relationship})</span>
              </th>
              <td className="gt">{m.gt}</td>
              <td className="n">
                <Count count={m.count} />
              </td>
              <td className="fields-inline">
                {m.fields.map(([key, value]) => (
                  <span key={key} title={describe.FORMAT[key]}>
                    {key} <i>{`${value}`}</i>
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const Card = React.memo(function Card({
  card,
  label,
  choices,
  describe,
  verdict,
  note,
  current,
  onVerdict,
  onNote,
  onPick,
  onEvent,
  bind,
}) {
  const [zoomed, setZoomed] = useState(false)
  return (
    <article
      className="card"
      ref={el => bind(card.id, el)}
      data-id={card.id}
      data-cls={card.cls}
      data-verdict={verdict}
      data-current={current ? 'true' : undefined}
      onClick={e => {
        if (!e.target.closest('a, button, input, summary')) {
          onPick(card.id)
        }
      }}
    >
      <div className="card-head">
        <span className="chip">{label}</span>
        <span className="model">{card.title}</span>
        {card.genes.length ? (
          <span className="genes" title={card.genes.join(', ')}>
            {geneLabel(card)}
          </span>
        ) : null}
        {card.change && card.change !== card.alleles ? (
          <span className="change">{card.change}</span>
        ) : null}
        {card.effects.length ? (
          <span className="effect">{card.effects.join(', ')}</span>
        ) : null}
        {card.impact ? (
          <span className="impact" data-impact={card.impact}>
            {card.impact}
          </span>
        ) : null}
        <Facets card={card} describe={describe} />
        {card.event && card.kind === 'record' ? (
          <button
            type="button"
            className="event"
            title="Show this event's cards"
            onClick={() => {
              onEvent(card.event)
            }}
          >
            {card.event}
          </button>
        ) : null}
        <Filter card={card} describe={describe} />
        <span className="meta">
          {[...facts(card), card.locs.join(' ↔ ')].join(' · ')}
        </span>
      </div>
      {card.trio ? (
        <TrioCalls card={card} describe={describe} />
      ) : card.lanes.some(l => l.reads !== undefined) || card.samples.length ? (
        <div className="evidence">
          <Lanes lanes={card.lanes} />
          {card.samples.map(s => (
            <span className="sample" key={s.name}>
              <b>{s.name}</b>
              {s.fields.map(([key, value]) => (
                <span key={key} title={describe.FORMAT[key]}>
                  {key} <i>{`${value}`}</i>
                </span>
              ))}
            </span>
          ))}
        </div>
      ) : null}
      {card.images.map(img => (
        <figure className="shot-set" key={img.name}>
          {card.images.length > 1 ? (
            <figcaption>{img.lanes.map(l => l.label).join(' and ')}</figcaption>
          ) : null}
          {img.src ? (
            <img
              className="shot"
              loading="lazy"
              alt={`${img.lanes.map(l => l.label).join(' and ')}: genome view of ${card.title}`}
              src={img.src}
              width={img.width}
              height={img.height}
              style={
                img.width ? { '--w': img.width, '--h': img.height } : undefined
              }
              data-zoom={zoomed}
              title="Click to switch between fitted and full size"
              onClick={() => {
                setZoomed(!zoomed)
              }}
            />
          ) : (
            <div className="missing">
              {img.status === 'failed'
                ? `This render failed. Rerun jb2export batch with --resume to draw it${card.url ? '; the link still opens it live' : ''}.`
                : 'This run has no image for the record: its --limit or --passOnly differed.'}
            </div>
          )}
        </figure>
      ))}
      {card.info.length ? (
        <details className="record">
          <summary>VCF record</summary>
          <Fields rows={card.info} descriptions={describe.INFO} />
        </details>
      ) : null}
      <div className="card-foot">
        <div className="verdicts">
          {choices.map(b => (
            <button
              key={b.v}
              type="button"
              data-v={b.v}
              data-tone={b.tone}
              title={b.title}
              aria-pressed={verdict === b.v}
              onClick={() => {
                onPick(card.id)
                onVerdict(card.id, b.v)
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
        <input
          className="note"
          type="text"
          aria-label={`Note on ${card.title}`}
          placeholder="Note"
          value={note}
          onFocus={() => {
            onPick(card.id)
          }}
          onChange={e => {
            onNote(card.id, e.target.value)
          }}
        />
        {card.url ? (
          <a className="live" href={card.url} target="_blank" rel="noopener">
            Open in JBrowse
          </a>
        ) : null}
      </div>
    </article>
  )
})

const chromOf = loc => loc.split(':')[0]

const headOf = card =>
  card.pos === undefined
    ? card.locs[0]
    : `${card.chrom}:${card.pos.toLocaleString('en-US')}`

const awayOf = card =>
  [...new Set(card.locs.slice(1).map(chromOf))].filter(
    c => c !== chromOf(headOf(card)),
  )

function Where({ card }) {
  const head = headOf(card)
  const away = awayOf(card)
  return (
    <>
      {head === card.title ? '' : head}
      {away.length ? (
        <span className="away">
          {' ↔ '}
          {away[0]}
          {away.length > 1 ? ` +${away.length - 1}` : ''}
        </span>
      ) : null}
    </>
  )
}

const laneOf = (card, label) => card.lanes.find(l => l.label === label)

const counted = lane => lane?.split !== undefined || lane?.alt !== undefined

function Reads({ lane }) {
  return counted(lane) ? (
    <span className={lane.reads ? '' : 'dim'}>
      {lane.split === undefined ? null : (
        <span className={lane.alt !== undefined && !lane.split ? 'dim' : ''}>
          {lane.split}
          {lane.alt === undefined ? '' : '+'}
        </span>
      )}
      {lane.alt === undefined ? null : (
        <>
          {lane.alt}
          <span className="dim">/{lane.depth}</span>
        </>
      )}
    </span>
  ) : null
}

function Table({
  cards,
  classes,
  choices,
  trio,
  describe,
  lanes,
  verdicts,
  notes,
  cursor,
  sort,
  onPick,
  onOpen,
  bind,
}) {
  const sortedOn = sort.startsWith('format:')
    ? sort.slice('format:'.length)
    : undefined
  const decimals = cards.some(c => {
    const v = sortValue(c, sort)
    return v !== undefined && !Number.isInteger(v)
  })
    ? 2
    : 0
  const columns = [
    {
      key: 'call',
      head: 'Call',
      cell: card => (
        <button
          type="button"
          className="open"
          title="Show this card"
          onClick={() => {
            onOpen(card.id)
          }}
        >
          {card.title}
        </button>
      ),
    },
    {
      key: 'genes',
      head: 'Genes',
      className: 'gene-cell',
      has: card => card.genes.length > 0 || !!card.change,
      title: card => [...card.genes, ...card.effects].join(', '),
      cell: card => (
        <div>
          <span className="genes">{geneLabel(card, 2)}</span>
          {card.change ? <span className="change"> {card.change}</span> : null}
        </div>
      ),
    },
    {
      key: 'impact',
      head: 'Impact',
      has: card => !!card.impact,
      cell: card =>
        card.impact ? (
          <span className="impact" data-impact={card.impact}>
            {card.impact}
          </span>
        ) : null,
    },
    {
      key: 'where',
      head: 'Position',
      className: 'where',
      has: card => headOf(card) !== card.title || awayOf(card).length > 0,
      title: card => card.locs.join('\n'),
      cell: card => <Where card={card} />,
    },
    {
      key: 'size',
      head: 'Size',
      numeric: true,
      has: card => card.size !== undefined,
      cell: card => sizeLabel(card.size),
    },
    ...(trio?.members ?? []).map((member, i) => ({
      key: `member:${member.sample}`,
      head: (
        <>
          {member.sample} <span className="rel">({member.relationship})</span>
        </>
      ),
      headTitle: `${member.sample}'s GT, and the reads jb2export counted with the allele named of those covering the site`,
      className: 'member',
      cell: card => {
        const m = card.trio?.members[i]
        return m ? (
          <>
            <span className="gt">{m.gt}</span> <Count count={m.count} />
          </>
        ) : null
      },
    })),
    ...(trio ? [] : lanes).map(label => ({
      key: `lane:${label}`,
      head: label,
      headTitle:
        'Split reads joining the loci, and reads with the ALT of those covering it',
      numeric: true,
      has: card => counted(laneOf(card, label)),
      cell: card => <Reads lane={laneOf(card, label)} />,
    })),
    ...(sortedOn
      ? [
          {
            key: 'sorted',
            head: sortedOn,
            headTitle: describe.FORMAT[sortedOn],
            numeric: true,
            cell: card => sortValue(card, sort)?.toFixed(decimals) ?? '',
          },
        ]
      : []),
    {
      key: 'filter',
      head: 'Filter',
      has: card => isFailing(card.filter),
      cell: card => <Filter card={card} describe={describe} />,
    },
    {
      key: 'verdict',
      head: 'Verdict',
      cell: card => {
        const b = choices.find(c => c.v === verdicts[card.id])
        return b ? (
          <span className="verdict" data-tone={b.tone}>
            {b.label}
          </span>
        ) : null
      },
    },
    {
      key: 'note',
      head: 'Note',
      className: 'note-cell',
      has: card => !!notes[card.id],
      cell: card => notes[card.id] ?? '',
    },
  ].filter(col => !col.has || cards.some(col.has))
  return (
    <table className="index">
      {trio ? (
        <caption>
          Each member's GT, then the reads with the allele named of those
          covering the site:{' '}
          <b>
            G 9<span className="dim">/20</span>
          </b>
        </caption>
      ) : null}
      {columns.some(col => col.key.startsWith('lane:')) ? (
        <caption>
          Reads per track: <b>13</b> split reads joining the loci,{' '}
          <b>
            17<span className="dim">/41</span>
          </b>{' '}
          reads with the ALT of those covering it,{' '}
          <b>
            3+4<span className="dim">/41</span>
          </b>{' '}
          both
        </caption>
      ) : null}
      <thead>
        <tr>
          {columns.map(col => (
            <th
              key={col.key}
              className={col.numeric ? 'n' : undefined}
              title={col.headTitle}
            >
              {col.head}
            </th>
          ))}
        </tr>
      </thead>
      {[...Map.groupBy(cards, c => c.cls)].map(([cls, rows]) => (
        <tbody key={cls} data-cls={cls}>
          <tr className="group">
            <th colSpan={columns.length} scope="rowgroup">
              <span className="chip">{classes[cls] ?? cls}</span>
              <span className="tally">
                {plural(rows.length, 'call')}
                {' · '}
                {rows.filter(c => verdicts[c.id]).length} judged
              </span>
            </th>
          </tr>
          {rows.map(card => (
            <tr
              key={card.id}
              ref={el => bind(card.id, el)}
              data-current={card.id === cursor ? 'true' : undefined}
              onClick={() => {
                onPick(card.id)
              }}
              onDoubleClick={() => {
                onOpen(card.id)
              }}
            >
              {columns.map(col => (
                <td
                  key={col.key}
                  className={col.numeric ? 'n' : col.className}
                  title={col.title?.(card)}
                >
                  {col.cell(card)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  )
}

export function App({ data }) {
  const choices = data.verdicts ?? VERDICTS
  // Verdicts, notes and the filters in the address start empty on both sides of
  // hydration and arrive on mount: the server has no way to know them, and
  // rendering a guess is a mismatch.
  const [ready, setReady] = useState(false)
  const [verdicts, setVerdicts] = useState({})
  const [notes, setNotes] = useState({})
  const [exported, setExported] = useState({ verdicts: {}, notes: {} })
  const [keysOpen, setKeysOpen] = useState(false)
  const [fit, setFit] = useState(true)
  const [filter, setFilter] = useState(FILTER_DEFAULTS)
  const [sort, setSort] = useState('callset')
  const [view, setView] = useState('cards')
  const [cursor, setCursor] = useState(/** @type {string | null} */ (null))
  const [msg, setMsg] = useState('')

  const nodes = useRef(new Map())
  const wantScroll = useRef(false)
  const fileInput = useRef(null)
  const searchInput = useRef(null)
  const headerEl = useRef(null)
  const msgTimer = useRef(undefined)

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(storageKey(data.portalId)) ?? '{}',
      )
      setVerdicts(saved.verdicts ?? {})
      setNotes(saved.notes ?? {})
      setExported(saved.exported ?? { verdicts: {}, notes: {} })
      setKeysOpen(!!saved.keys)
      setFit(saved.fit ?? true)
    } catch {
      /* private window, or site data blocked */
    }
    const {
      sort: hashSort,
      view: hashView,
      card,
      ...hashFilter
    } = fromHash(location.hash)
    setFilter(hashFilter)
    setSort(hashSort)
    setView(hashView === 'table' ? 'table' : 'cards')
    if (card) {
      wantScroll.current = true
      setCursor(card)
    }
    setReady(true)
  }, [data.portalId])

  useEffect(() => {
    if (!ready) {
      return
    }
    try {
      localStorage.setItem(
        storageKey(data.portalId),
        JSON.stringify({
          verdicts,
          notes,
          exported,
          keys: keysOpen,
          fit,
        }),
      )
    } catch {
      /* nothing to do; the page still works for this session */
    }
  }, [ready, data.portalId, verdicts, notes, exported, keysOpen, fit])

  useEffect(() => {
    if (ready) {
      history.replaceState(
        null,
        '',
        toHash({ ...filter, sort, view, card: cursor ?? '' }) ||
          location.pathname + location.search,
      )
    }
  }, [ready, filter, sort, view, cursor])

  // The header wraps with the window and with what a callset gives it to show,
  // and everything scrolled to has to land under it.
  useEffect(() => {
    const el = headerEl.current
    const measure = () => {
      document.documentElement.style.setProperty(
        '--header-h',
        `${el.offsetHeight}px`,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
    }
  }, [])

  const bind = useCallback((id, el) => {
    if (el) {
      nodes.current.set(id, el)
    } else {
      nodes.current.delete(id)
    }
  }, [])

  const visible = useMemo(() => {
    const sorted = sortCards(
      data.cards.filter(c => matches(c, { ...filter, verdicts })),
      sort,
    )
    const rank = Object.keys(data.classes)
    return view === 'table'
      ? sorted.toSorted((a, b) => rank.indexOf(a.cls) - rank.indexOf(b.cls))
      : sorted
  }, [data.cards, data.classes, filter, verdicts, sort, view])
  const counts = useMemo(
    () => tallyVerdicts(data.cards, verdicts, choices),
    [data.cards, verdicts, choices],
  )
  const done = choices.reduce((n, b) => n + counts[b.v], 0)
  const pending = useMemo(
    () => unexported(data.cards, { verdicts, notes }, exported),
    [data.cards, verdicts, notes, exported],
  )

  useEffect(() => {
    if (!ready || !wantScroll.current) {
      return
    }
    wantScroll.current = false
    nodes.current.get(cursor)?.scrollIntoView({
      block: view === 'table' ? 'nearest' : 'start',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  }, [ready, cursor, view])

  const setVerdict = useCallback(
    (id, val) => {
      const next = { ...verdicts }
      if (next[id] === val) {
        delete next[id]
      } else {
        next[id] = val
      }

      // Under a verdict filter the card just judged leaves the list. The cursor
      // steps to the one closing over it, not out of the page with the card and
      // not back to the top of a queue the reviewer is deep into.
      const card = data.cards.find(c => c.id === id)
      if (card && !matches(card, { ...filter, verdicts: next })) {
        const i = visible.findIndex(c => c.id === id)
        const successor =
          i === -1 ? null : (visible[i + 1] ?? visible[i - 1] ?? null)
        setCursor(successor?.id ?? null)
      }
      setVerdicts(next)
    },
    [verdicts, data.cards, filter, visible],
  )

  const setNote = useCallback((id, text) => {
    setNotes(prev => {
      const next = { ...prev }
      if (text) {
        next[id] = text
      } else {
        delete next[id]
      }
      return next
    })
  }, [])

  const patchFilter = useCallback(patch => {
    setFilter(prev => ({ ...prev, ...patch }))
  }, [])

  const showEvent = useCallback(
    event => {
      patchFilter({ event })
    },
    [patchFilter],
  )

  const openCard = useCallback(id => {
    wantScroll.current = true
    setCursor(id)
    setView('cards')
  }, [])

  const move = useCallback(
    step => {
      if (!visible.length) {
        return
      }
      const i = visible.findIndex(c => c.id === cursor)
      const next =
        i === -1
          ? step > 0
            ? 0
            : visible.length - 1
          : Math.min(visible.length - 1, Math.max(0, i + step))
      wantScroll.current = true
      setCursor(visible[next].id)
    },
    [visible, cursor],
  )

  useEffect(() => {
    function onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      const t = e.target
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) {
        if (
          e.key === 'Escape' ||
          (e.key === 'Enter' && t.tagName === 'INPUT')
        ) {
          t.blur()
        }
        return
      }
      const here = visible.some(c => c.id === cursor) ? cursor : null
      const act = {
        '/': () => {
          searchInput.current?.focus()
          searchInput.current?.select()
        },
        '?': () => {
          setKeysOpen(open => !open)
        },
        j: () => {
          move(1)
        },
        k: () => {
          move(-1)
        },
        t: () => {
          wantScroll.current = true
          setView(v => (v === 'table' ? 'cards' : 'table'))
        },
        f: () => {
          wantScroll.current = true
          setFit(on => !on)
        },
        n: () => {
          nodes.current.get(here)?.querySelector('input.note')?.focus()
        },
        o: () => {
          const url = visible.find(c => c.id === here)?.url
          if (url) {
            window.open(url, '_blank', 'noopener')
          }
        },
        Enter: () => {
          if (view === 'table' && here) {
            openCard(here)
          }
        },
      }[e.key]
      if (act) {
        e.preventDefault()
        act()
        return
      }
      const hit = choices.find(b => b.key === e.key)
      const id = here ?? visible[0]?.id
      if (!hit || !id) {
        return
      }
      e.preventDefault()
      if (id !== cursor) {
        wantScroll.current = true
        setCursor(id)
      }
      setVerdict(id, hit.v)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
    }
  }, [move, setVerdict, openCard, visible, cursor, view, choices])

  // Changing a filter can strand the cursor on a card that is no longer
  // listed; there is no position to hold on to, so it goes to the top.
  useEffect(() => {
    if (!ready || cursor === null || visible.some(c => c.id === cursor)) {
      return
    }
    setCursor(visible.length ? visible[0].id : null)
  }, [ready, visible, cursor])

  // One timer rather than one per message: two messages inside five seconds and
  // the first one's timer wipes the second.
  const say = useCallback(text => {
    setMsg(text)
    clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => {
      setMsg('')
    }, 5000)
  }, [])

  function exportTsv() {
    const blob = new Blob([toTsv(data.cards, verdicts, notes)], {
      type: 'text/tab-separated-values',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${data.portalId}-verdicts.tsv`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => {
      URL.revokeObjectURL(a.href)
    }, 1000)
    setExported({ verdicts, notes })
  }

  function importTsv(file) {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      const res = fromTsv(
        typeof reader.result === 'string' ? reader.result : '',
        data.cards,
        choices,
      )
      if (res.error) {
        say(res.error)
        return
      }
      setVerdicts(prev => mergeEdits(prev, res.changes))
      setNotes(prev => mergeEdits(prev, res.notes))
      setExported(prev => ({
        verdicts: mergeEdits(prev.verdicts, res.changes),
        notes: mergeEdits(prev.notes, res.notes),
      }))
      say(
        `${plural(res.applied, 'verdict')} read in${
          res.unknown
            ? `, ${res.unknown} for records this portal does not carry`
            : ''
        }.`,
      )
    })
    reader.readAsText(file)
  }

  const clsCounts = useMemo(() => {
    const out = {}
    for (const c of data.cards) {
      out[c.cls] = (out[c.cls] ?? 0) + 1
    }
    return out
  }, [data.cards])

  const chips = [{ k: 'all', label: 'All', n: data.cards.length }].concat(
    Object.keys(data.classes)
      .filter(k => clsCounts[k])
      .map(k => ({ k, label: data.classes[k], n: clsCounts[k] })),
  )

  const events = useMemo(
    () =>
      [...new Set(data.cards.filter(c => c.event).map(c => c.event))].toSorted(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      ),
    [data.cards],
  )

  // in the order a reviewer takes the queue: unsupported first
  const supports = useMemo(
    () =>
      Object.keys(data.support)
        .map(k => [k, data.cards.filter(c => c.support === k).length])
        .filter(([, n]) => n),
    [data.cards, data.support],
  )

  const impacts = useMemo(
    () =>
      IMPACTS.map(k => [
        k,
        data.cards.filter(c => c.impact === k).length,
      ]).filter(([, n]) => n),
    [data.cards],
  )

  const sorts = useMemo(() => sortOptions(data.cards), [data.cards])

  const laneLabels = useMemo(
    () => [
      ...new Set(
        data.cards.flatMap(c =>
          c.lanes.filter(l => l.reads !== undefined).map(l => l.label),
        ),
      ),
    ],
    [data.cards],
  )

  const pct = x => `${data.cards.length ? (x / data.cards.length) * 100 : 0}%`
  const filtered = Object.entries(filter).some(
    ([key, value]) => value !== (FILTER_DEFAULTS[key] ?? 'all'),
  )

  return (
    <>
      <header ref={headerEl}>
        <h1>{data.title}</h1>
        <span className="eyebrow">{data.eyebrow}</span>
        <div className="progress">
          <div className="r">
            <span id="done">
              {done} of {data.cards.length} judged
            </span>
            <span id="tally">
              {choices
                .map(b => `${counts[b.v]} ${b.label.toLowerCase()}`)
                .join(' · ')}
            </span>
          </div>
          <div className="bar">
            {choices.map(b => (
              <span
                key={b.v}
                className={`b-${b.tone}`}
                style={{ width: pct(counts[b.v]) }}
              />
            ))}
          </div>
        </div>
        <div className="actions">
          <div className="segmented" role="group" aria-label="Layout">
            {[
              ['cards', 'Cards'],
              ['table', 'Table'],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                data-view={v}
                aria-pressed={view === v}
                onClick={() => {
                  wantScroll.current = true
                  setView(v)
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            id="fit"
            type="button"
            aria-pressed={fit}
            title="Scale each image to fit the window"
            onClick={() => {
              setFit(!fit)
            }}
          >
            Fit
          </button>
          <button
            id="keysbtn"
            type="button"
            aria-expanded={keysOpen}
            onClick={() => {
              setKeysOpen(!keysOpen)
            }}
          >
            Keys
          </button>
          <button
            id="import"
            type="button"
            onClick={() => fileInput.current?.click()}
          >
            Import
          </button>
          <input
            type="file"
            id="importfile"
            ref={fileInput}
            accept=".tsv,.txt,text/tab-separated-values"
            hidden
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) {
                importTsv(file)
              }
              e.target.value = ''
            }}
          />
          <button
            id="export"
            type="button"
            data-pending={pending > 0}
            title={
              pending
                ? `${plural(pending, 'card')} judged or noted since the last export live only in this browser`
                : 'Download every verdict and note as TSV'
            }
            onClick={exportTsv}
          >
            Export{pending ? ` · ${pending} new` : ''}
          </button>
          <button
            id="reset"
            type="button"
            disabled={!done && !Object.keys(notes).length}
            onClick={() => {
              if (confirm('Clear every verdict and note on this portal?')) {
                setVerdicts({})
                setNotes({})
                setExported({ verdicts: {}, notes: {} })
              }
            }}
          >
            Reset
          </button>
        </div>

        <div className="hrow">
          <div className="filters">
            {chips.map(ch => (
              <button
                key={ch.k}
                type="button"
                data-cls={ch.k}
                aria-pressed={filter.cls === ch.k}
                onClick={() => {
                  patchFilter({ cls: ch.k })
                }}
              >
                {ch.label}
                <span className="count">{ch.n}</span>
              </button>
            ))}
          </div>
          {events.length ? (
            <select
              id="ef"
              aria-label="Filter by event"
              value={filter.event}
              onChange={e => {
                patchFilter({ event: e.target.value })
              }}
            >
              <option value="all">Any event</option>
              {events.map(ev => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          ) : null}
          {supports.length > 1 ? (
            <select
              id="sf"
              aria-label="Filter by read support"
              title={`Grouped on ${data.supportFrom}`}
              value={filter.support}
              onChange={e => {
                patchFilter({ support: e.target.value })
              }}
            >
              <option value="all">Any support</option>
              {supports.map(([k, n]) => (
                <option key={k} value={k}>
                  {data.support[k]} ({n})
                </option>
              ))}
            </select>
          ) : null}
          {data.facets.map(({ key, values }) => (
            <select
              key={key}
              data-facet={key}
              aria-label={`Filter by ${key}`}
              title={data.describe.INFO[key]}
              value={filter[FACET_PREFIX + key] ?? 'all'}
              onChange={e => {
                patchFilter({ [FACET_PREFIX + key]: e.target.value })
              }}
            >
              <option value="all">Any {key}</option>
              {values.map(([value, n]) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')} ({n})
                </option>
              ))}
            </select>
          ))}
          {impacts.length ? (
            <select
              id="if"
              aria-label="Filter by annotated impact"
              value={filter.impact}
              onChange={e => {
                patchFilter({ impact: e.target.value })
              }}
            >
              <option value="all">Any impact</option>
              {impacts.map(([k, n]) => (
                <option key={k} value={k}>
                  {k} ({n})
                </option>
              ))}
            </select>
          ) : null}
          <select
            id="vf"
            aria-label="Filter by verdict"
            value={filter.verdictFilter}
            onChange={e => {
              patchFilter({ verdictFilter: e.target.value })
            }}
          >
            {[
              ['all', 'Any verdict'],
              ['unreviewed', 'Unreviewed'],
              ...choices.map(b => [b.v, b.label]),
            ].map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          {sorts.length > 1 ? (
            <select
              id="sort"
              aria-label="Order"
              value={sort}
              onChange={e => {
                setSort(e.target.value)
              }}
            >
              {sorts.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          ) : null}
          <input
            type="search"
            id="q"
            ref={searchInput}
            placeholder="Find a gene, change, id or chromosome"
            value={filter.q}
            onChange={e => {
              patchFilter({ q: e.target.value })
            }}
          />
          {filtered ? (
            <span className="shown">
              {visible.length} shown
              <button
                type="button"
                className="clear"
                onClick={() => {
                  setFilter(FILTER_DEFAULTS)
                }}
              >
                Clear filters
              </button>
            </span>
          ) : null}
          <span id="msg" className="msg" role="status">
            {msg}
          </span>
        </div>

        <div className="keys" id="keys" hidden={!keysOpen}>
          <span>
            <kbd>j</kbd>
            <kbd>k</kbd> move
          </span>
          <span>
            {choices.map(b => (
              <React.Fragment key={b.v}>
                <kbd>{b.key}</kbd> {b.label.toLowerCase()}{' '}
              </React.Fragment>
            ))}
          </span>
          <span>
            <kbd>n</kbd> note
          </span>
          <span>
            <kbd>o</kbd> open in JBrowse
          </span>
          <span>
            <kbd>t</kbd> table <kbd>Enter</kbd> its card
          </span>
          <span>
            <kbd>f</kbd> fit images to the window
          </span>
          <span>
            <kbd>/</kbd> search
          </span>
          <span>
            <kbd>?</kbd> these keys
          </span>
        </div>
      </header>

      <main data-fit={fit} data-view={view}>
        {!visible.length ? (
          <div className="empty">No cards match these filters.</div>
        ) : view === 'table' ? (
          <Table
            cards={visible}
            classes={data.classes}
            choices={choices}
            trio={data.trio}
            describe={data.describe}
            lanes={laneLabels}
            verdicts={verdicts}
            notes={notes}
            cursor={cursor}
            sort={sort}
            onPick={setCursor}
            onOpen={openCard}
            bind={bind}
          />
        ) : (
          <div className="cards" id="cards">
            {visible.map(c => (
              <Card
                key={c.id}
                card={c}
                label={data.classes[c.cls]}
                choices={choices}
                describe={data.describe}
                verdict={verdicts[c.id] ?? ''}
                note={notes[c.id] ?? ''}
                current={c.id === cursor}
                onVerdict={setVerdict}
                onNote={setNote}
                onPick={setCursor}
                onEvent={showEvent}
                bind={bind}
              />
            ))}
          </div>
        )}
        <footer>{data.footer}</footer>
      </main>
    </>
  )
}
