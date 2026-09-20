// The review page. One component tree, rendered twice: to a string when the
// portal is written, so the cards and their images are in the HTML before any
// script runs, and again in the browser to hydrate the parts that take input.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  fromTsv,
  matches,
  sizeLabel,
  storageKey,
  tallyVerdicts,
  toTsv,
  VERDICTS,
} from "./review.mjs"

const VERDICT_FILTERS = [
  ["all", "Any verdict"],
  ["unreviewed", "Unreviewed"],
  ...VERDICTS.map(b => [b.v, b.label]),
]

const total = links => links.reduce((a, b) => a + b, 0)

function facts(card) {
  if (card.kind === 'event') {
    return [
      `${card.members} record${card.members === 1 ? '' : 's'}`,
      `${card.locs.length} loci`,
    ]
  }
  return [
    card.svtype,
    sizeLabel(card.size),
    card.filter === 'PASS' || card.filter === '.' ? '' : card.filter,
    card.qual === undefined ? '' : `QUAL ${card.qual}`,
    card.eventType,
  ].filter(Boolean)
}

const Card = React.memo(function Card({
  card,
  label,
  verdict,
  current,
  onVerdict,
  onPick,
  onEvent,
  bind,
}) {
  return (
    <article
      className="card"
      ref={el => bind(card.id, el)}
      data-id={card.id}
      data-cls={card.cls}
      data-verdict={verdict}
      data-current={current ? 'true' : undefined}
      onClick={e => {
        if (!e.target.closest('a') && !e.target.closest('button')) {
          onPick(card.id)
        }
      }}
    >
      <div className="card-head">
        <span className="chip">{label}</span>
        <span className="model">{card.title}</span>
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
        <span className="meta">
          {[...facts(card), card.locs.join(' ↔ ')].join(' · ')}
        </span>
      </div>
      {card.images.map(img => (
        <figure className="shot-set" key={img.label} data-set={img.label}>
          <figcaption>
            {img.label}
            {img.links ? (
              <span className="links-count" data-zero={!total(img.links)}>
                {img.links.join(' + ')} split read
                {total(img.links) === 1 ? '' : 's'} join the panels
              </span>
            ) : null}
          </figcaption>
          {img.src ? (
            <img
              className="shot"
              loading="lazy"
              alt={`${img.label}: genome view of ${card.title}`}
              src={img.src}
            />
          ) : (
            <div className="missing">
              {img.status === 'failed'
                ? 'This render failed. The link still opens it live.'
                : 'This run has no image for the record: its --limit or --passOnly differed.'}
            </div>
          )}
        </figure>
      ))}
      <div className="card-foot">
        <div className="verdicts">
          {VERDICTS.map(b => (
            <button
              key={b.v}
              type="button"
              data-v={b.v}
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
        {card.url ? (
          <div className="links">
            <a className="live" href={card.url} target="_blank" rel="noopener">
              Open in JBrowse
            </a>
          </div>
        ) : null}
      </div>
    </article>
  )
})

export function App({ data }) {
  // Verdicts start empty on both sides of hydration and arrive from
  // localStorage on mount: the server has no way to know them, and rendering a
  // guess is a mismatch.
  const [verdicts, setVerdicts] = useState({})
  const [keysOpen, setKeysOpen] = useState(false)
  const [cls, setCls] = useState('all')
  const [event, setEvent] = useState('all')
  const [support, setSupport] = useState('all')
  const [verdictFilter, setVerdictFilter] = useState('all')
  const [q, setQ] = useState('')
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
        localStorage.getItem(storageKey(data.portalId)) || '{}',
      )
      if (saved.verdicts) {
        setVerdicts(saved.verdicts)
      }
      if (saved.keys) {
        setKeysOpen(true)
      }
    } catch {
      /* private window, or site data blocked */
    }
  }, [data.portalId])

  const persist = useCallback(
    (nextVerdicts, nextKeys) => {
      try {
        localStorage.setItem(
          storageKey(data.portalId),
          JSON.stringify({ verdicts: nextVerdicts, keys: nextKeys }),
        )
      } catch {
        /* nothing to do; the page still works for this session */
      }
    },
    [data.portalId],
  )

  const bind = useCallback((id, el) => {
    if (el) {
      nodes.current.set(id, el)
    } else {
      nodes.current.delete(id)
    }
  }, [])

  const filter = useMemo(
    () => ({ cls, event, support, verdictFilter, q }),
    [cls, event, support, verdictFilter, q],
  )
  const visible = useMemo(
    () => data.cards.filter(c => matches(c, { ...filter, verdicts })),
    [data.cards, filter, verdicts],
  )
  const counts = useMemo(
    () => tallyVerdicts(data.cards, verdicts),
    [data.cards, verdicts],
  )
  const done = VERDICTS.reduce((n, b) => n + counts[b.v], 0)

  useEffect(() => {
    if (!wantScroll.current) {
      return
    }
    wantScroll.current = false
    const el = nodes.current.get(cursor)
    if (el) {
      // A card is taller than the window, so it goes to the top, and the top is
      // under a sticky header whose height depends on how its controls wrapped.
      window.scrollTo({
        top:
          el.getBoundingClientRect().top +
          window.scrollY -
          (headerEl.current?.offsetHeight ?? 0) -
          8,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      })
    }
  }, [cursor])

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
      persist(next, keysOpen)
    },
    [verdicts, data.cards, filter, visible, persist, keysOpen],
  )

  const toggleKeys = useCallback(() => {
    setKeysOpen(!keysOpen)
    persist(verdicts, !keysOpen)
  }, [keysOpen, persist, verdicts])

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
        if (e.key === 'Escape') {
          t.blur()
        }
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        searchInput.current?.focus()
        searchInput.current?.select()
        return
      }
      if (e.key === '?') {
        toggleKeys()
        return
      }
      if (e.key === 'j') {
        e.preventDefault()
        move(1)
        return
      }
      if (e.key === 'k') {
        e.preventDefault()
        move(-1)
        return
      }
      if (e.key === 'o') {
        const a = nodes.current.get(cursor)?.querySelector('a.live')
        if (a) {
          window.open(a.href, '_blank', 'noopener')
        }
        return
      }
      const hit = VERDICTS.find(b => b.key === e.key)
      if (!hit) {
        return
      }
      e.preventDefault()
      const id = visible.some(c => c.id === cursor) ? cursor : visible[0]?.id
      if (!id) {
        return
      }
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
  }, [move, toggleKeys, setVerdict, visible, cursor])

  // Changing a filter can strand the cursor on a card that is no longer
  // listed; there is no position to hold on to, so it goes to the top.
  useEffect(() => {
    if (cursor === null || visible.some(c => c.id === cursor)) {
      return
    }
    setCursor(visible.length ? visible[0].id : null)
  }, [visible, cursor])

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
    const blob = new Blob([toTsv(data.cards, verdicts)], {
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
  }

  function importTsv(file) {
    const reader = new FileReader()
    reader.onload = () => {
      const res = fromTsv(String(reader.result), data.cards)
      if (res.error) {
        say(res.error)
        return
      }
      const next = { ...verdicts }
      for (const [id, v] of Object.entries(res.changes)) {
        if (v === null) {
          delete next[id]
        } else {
          next[id] = v
        }
      }
      setVerdicts(next)
      persist(next, keysOpen)
      say(
        `${res.applied} verdict${res.applied === 1 ? '' : 's'} read in${
          res.unknown
            ? `, ${res.unknown} for records this portal does not carry`
            : ''
        }.`,
      )
    }
    reader.readAsText(file)
  }

  const clsCounts = useMemo(() => {
    const out = {}
    for (const c of data.cards) {
      out[c.cls] = (out[c.cls] || 0) + 1
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
      [...new Set(data.cards.filter(c => c.event).map(c => c.event))].sort(
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

  const pct = x => `${data.cards.length ? (x / data.cards.length) * 100 : 0}%`

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
              {VERDICTS.map(b => `${counts[b.v]} ${b.label.toLowerCase()}`).join(
                ' · ',
              )}
            </span>
          </div>
          <div className="bar">
            {VERDICTS.map(b => (
              <span
                key={b.v}
                className={`b-${b.v}`}
                style={{ width: pct(counts[b.v]) }}
              />
            ))}
          </div>
        </div>
        <div className="actions">
          <button
            id="keysbtn"
            type="button"
            aria-expanded={keysOpen}
            onClick={toggleKeys}
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
          <button id="export" type="button" onClick={exportTsv}>
            Export
          </button>
          <button
            id="reset"
            type="button"
            disabled={!done}
            onClick={() => {
              if (!confirm('Clear every verdict on this portal?')) {
                return
              }
              setVerdicts({})
              persist({}, keysOpen)
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
                aria-pressed={cls === ch.k}
                onClick={() => {
                  setCls(ch.k)
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
              value={event}
              onChange={e => {
                setEvent(e.target.value)
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
              value={support}
              onChange={e => {
                setSupport(e.target.value)
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
          <select
            id="vf"
            aria-label="Filter by verdict"
            value={verdictFilter}
            onChange={e => {
              setVerdictFilter(e.target.value)
            }}
          >
            {VERDICT_FILTERS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="search"
            id="q"
            ref={searchInput}
            placeholder="Find an id, event or chromosome"
            value={q}
            onChange={e => {
              setQ(e.target.value)
            }}
          />
          <span id="msg" className="msg" role="status">
            {msg}
          </span>
        </div>

        <div className="keys" id="keys" hidden={!keysOpen}>
          <span>
            <kbd>j</kbd>
            <kbd>k</kbd> move between cards
          </span>
          <span>
            <kbd>1</kbd> real <kbd>2</kbd> needs a look <kbd>3</kbd> artifact
          </span>
          <span>
            <kbd>o</kbd> open in JBrowse
          </span>
          <span>
            <kbd>/</kbd> search
          </span>
          <span>
            <kbd>?</kbd> these keys
          </span>
        </div>
      </header>

      <main>
        <div className="cards" id="cards">
          {visible.length ? (
            visible.map(c => (
              <Card
                key={c.id}
                card={c}
                label={data.classes[c.cls]}
                verdict={verdicts[c.id] || ''}
                current={c.id === cursor}
                onVerdict={setVerdict}
                onPick={setCursor}
                onEvent={setEvent}
                bind={bind}
              />
            ))
          ) : (
            <div className="empty">No cards match these filters.</div>
          )}
        </div>
        <footer>{data.footer}</footer>
      </main>
    </>
  )
}
