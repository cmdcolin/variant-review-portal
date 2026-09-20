// Manifests and a VCF in, cards out. Pure: no file is read here, so the tests
// hand it strings.
import VCF from '@gmod/vcf'

const MANIFEST_COLUMNS = ['file', 'locs', 'name', 'line', 'event', 'status']

// JBrowse's own buckets (plugins/variants variantSvType.ts): a caller's TRA is
// a breakend, and DUP:TANDEM is a duplication.
const CLASS_OF = { DEL: 'DEL', DUP: 'DUP', INS: 'INS', INV: 'INV', CNV: 'CNV', BND: 'BND', TRA: 'BND' }

export const CLASSES = {
  DEL: 'Deletion',
  DUP: 'Duplication',
  INS: 'Insertion',
  INV: 'Inversion',
  CNV: 'Copy number',
  BND: 'Breakend',
  OTHER: 'Other',
  EVENT: 'Event',
}

export function svClass(svtype) {
  const token = `${svtype ?? ''}`.toUpperCase().split(':')[0].trim()
  return CLASS_OF[token] ?? 'OTHER'
}

/**
 * The rows of one `jb2export batch --manifest` run. A manifest from a
 * `@jbrowse/img` that predates the `line` column cannot be joined to the VCF,
 * and says so here rather than producing cards with no facts on them.
 */
export function parseManifest(text) {
  const [head, ...lines] = text.split(/\r?\n/).filter(l => l.length)
  const columns = (head ?? '').split('\t')
  const missing = MANIFEST_COLUMNS.filter(c => !columns.includes(c))
  if (missing.length) {
    throw new Error(
      `manifest.tsv has no ${missing.join(', ')} column: it was written by a jb2export that predates them. Re-render with a current @jbrowse/img.`,
    )
  }
  return lines.map(l => {
    const f = l.split('\t')
    const at = name => f[columns.indexOf(name)] ?? ''
    return {
      file: at('file'),
      locs: at('locs').split(' ').filter(Boolean),
      name: at('name'),
      line: at('line') ? Number(at('line')) : undefined,
      event: at('event'),
      // reads with pieces in more than one panel, per alignments track; absent
      // for an image of one panel, and from a jb2export that did not count
      links:
        columns.includes('links') && at('links') !== ''
          ? at('links').split(',').map(Number)
          : undefined,
      status: at('status'),
    }
  })
}

/** The VCF's records by 1-based line number, parsed by `@gmod/vcf`. */
export function readVcf(text) {
  const lines = text.split('\n')
  const header = lines.filter(l => l.startsWith('#')).join('\n')
  const parser = new VCF({ header })
  return {
    record(lineNo) {
      const line = lines[lineNo - 1]
      return line && !line.startsWith('#') ? parser.parseLine(line) : undefined
    },
  }
}

const first = v => (Array.isArray(v) ? v[0] : v)

function recordFacts(variant) {
  const info = variant.INFO ?? {}
  const svtype = first(info.SVTYPE)
  const svlen = first(info.SVLEN)
  const end = first(info.END)
  const size =
    typeof svlen === 'number'
      ? Math.abs(svlen)
      : typeof end === 'number' && !info.CHR2 && end > variant.POS
        ? end - variant.POS
        : undefined
  return {
    chrom: variant.CHROM,
    pos: variant.POS,
    vcfId: variant.ID?.join(',') ?? '',
    svtype: svtype ?? '',
    size,
    alt: (variant.ALT ?? []).join(','),
    filter:
      variant.FILTER === 'PASS'
        ? 'PASS'
        : Array.isArray(variant.FILTER)
          ? variant.FILTER.join(';')
          : '.',
    qual: variant.QUAL ?? undefined,
    eventType: first(info.EVENTTYPE) ?? '',
  }
}

function imagesFor(sets, find) {
  return sets.map(({ label, rows }) => {
    const row = find(rows)
    return {
      label,
      src: row?.status === 'failed' ? undefined : row && `img/${label}/${row.file}`,
      status: row?.status ?? 'absent',
      links: row?.links,
    }
  })
}

// "Split read", because that is all the count holds: a read drawn as pieces
// with a connector between them. A deletion short enough for one alignment to
// carry draws a gap and no connector, so it lands in `none` with its support in
// plain sight. The classes order a queue; the picture decides a card.
export const SUPPORT = {
  none: 'No split read joins the panels',
  control: 'Split reads in a control too',
  sample: 'Split reads in the sample only',
  uncounted: 'One panel',
}

const total = links => links.reduce((a, b) => a + b, 0)

/**
 * What the counts under a card's images say, in the order a reviewer wants the
 * queue: a call no read supports, a call the control carries too, a call only
 * the sample carries. The first image set is the sample; the rest are controls.
 */
export function supportOf([sample, ...controls]) {
  return sample?.links === undefined
    ? 'uncounted'
    : total(sample.links) === 0
      ? 'none'
      : controls.some(c => c.links !== undefined && total(c.links) > 0)
        ? 'control'
        : 'sample'
}

/**
 * One card per row of the first image set, which is the sample under review;
 * every other set (a matched normal, a second caller's tracks) is joined to it
 * on the record's VCF line, or on the label for an event's image.
 *
 * `link` builds a card's live URL from its loci, or is absent.
 */
export function buildCards({ vcfText, sets, link }) {
  const vcf = readVcf(vcfText)
  const [primary] = sets
  const records = primary.rows.filter(r => r.line !== undefined)
  const membersOf = new Map()
  for (const r of records) {
    if (r.event) {
      membersOf.set(r.event, (membersOf.get(r.event) ?? 0) + 1)
    }
  }
  return primary.rows.map(row => {
    const base = {
      locs: row.locs,
      event: row.event,
      url: link?.(row.locs),
    }
    if (row.line === undefined) {
      const images = imagesFor(sets, rows =>
        rows.find(r => r.line === undefined && r.event === row.event),
      )
      return {
        ...base,
        images,
        support: supportOf(images),
        id: `event:${row.event}`,
        kind: 'event',
        cls: 'EVENT',
        title: row.event,
        members: membersOf.get(row.event) ?? 0,
      }
    }
    const variant = vcf.record(row.line)
    if (!variant) {
      throw new Error(
        `manifest line ${row.line} is not a record of this VCF: the manifest was rendered from a different file`,
      )
    }
    const facts = recordFacts(variant)
    const images = imagesFor(sets, rows => rows.find(r => r.line === row.line))
    return {
      ...base,
      ...facts,
      images,
      support: supportOf(images),
      id: `${row.line}`,
      kind: 'record',
      line: row.line,
      cls: svClass(facts.svtype),
      title: facts.vcfId || `${facts.chrom}:${facts.pos.toLocaleString('en-US')}`,
    }
  })
}

/**
 * The URL that opens a card's loci live: a breakpoint split view over several,
 * a linear view over one, with the tracks the images were rendered from.
 */
export function liveLink({ jbrowse, config, assembly, tracks }) {
  return locs => {
    const panel = loc => ({ loc, assembly, tracks })
    const view =
      locs.length > 1
        ? { type: 'BreakpointSplitView', views: locs.map(panel) }
        : { type: 'LinearGenomeView', ...panel(locs[0]) }
    const spec = encodeURIComponent(JSON.stringify({ views: [view] }))
    return `${jbrowse}?config=${encodeURIComponent(config)}&session=spec-${spec}`
  }
}
