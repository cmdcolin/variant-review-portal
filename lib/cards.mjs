// Manifests and a VCF in, cards out. Pure: no file is read here, so the tests
// hand it strings.
import VCF from '@gmod/vcf'

const MANIFEST_COLUMNS = ['file', 'locs', 'name', 'line', 'event', 'status']

// JBrowse's own buckets (plugins/variants variantSvType.ts): a caller's TRA is
// a breakend, and DUP:TANDEM is a duplication.
const CLASS_OF = { DEL: 'DEL', DUP: 'DUP', INS: 'INS', INV: 'INV', CNV: 'CNV', BND: 'BND', TRA: 'BND' }

export const CLASSES = {
  SNV: 'SNV',
  MNV: 'MNV',
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
 * The class of a record with no SVTYPE, read off the alleles it spells out: the
 * first ALT against REF.
 */
export function smallVariantClass(ref, alt) {
  if (!/^[ACGTN]+$/i.test(ref ?? '') || !/^[ACGTN]+$/i.test(alt ?? '')) {
    return 'OTHER'
  }
  return ref.length === alt.length
    ? ref.length === 1
      ? 'SNV'
      : 'MNV'
    : alt.length > ref.length
      ? 'INS'
      : 'DEL'
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
    // `17/41,0/55`: per alignments track, reads counted over reads covering
    const pairs = name =>
      columns.includes(name) && at(name) !== ''
        ? at(name)
            .split(',')
            .map(pair => pair.split('/').map(Number))
            .map(([reads, depth]) => ({ reads, depth }))
        : undefined
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
      // A one-panel record's count at its variant, absent where it named no
      // column to count at: `carriers` is the reads with its ALT, and `nonref`,
      // which a jb2export without that column writes, every read differing from
      // the reference there.
      carriers:
        pairs('carriers') ??
        pairs('nonref')?.map(pair => ({ ...pair, anyDifference: true })),
      status: at('status'),
    }
  })
}

const IMPACTS = ['HIGH', 'MODERATE', 'LOW', 'MODIFIER']

// SnpEff's ANN and VEP's CSQ both name their pipe-separated columns in the
// header, after the last colon of the description.
const ANNOTATION_COLUMNS = {
  gene: ['gene_name', 'symbol'],
  effect: ['annotation', 'consequence'],
  impact: ['annotation_impact', 'impact'],
  protein: ['hgvs.p', 'hgvsp'],
  coding: ['hgvs.c', 'hgvsc'],
}

function annotationReader(parser) {
  for (const key of ['ANN', 'CSQ']) {
    const description = parser.getMetadata('INFO', key)?.Description
    if (description) {
      const names = description
        .slice(description.lastIndexOf(':') + 1)
        .split('|')
        .map(n => n.replaceAll(/['"]/g, '').trim().toLowerCase())
      const at = Object.fromEntries(
        Object.entries(ANNOTATION_COLUMNS).map(([k, wanted]) => [
          k,
          names.findIndex(n => wanted.includes(n)),
        ]),
      )
      if (at.gene !== -1 && at.effect !== -1) {
        return info =>
          (info[key] ?? []).map(entry => {
            const f = `${entry}`.split('|')
            return {
              genes: (f[at.gene] ?? '').split('&').filter(Boolean),
              effects: (f[at.effect] ?? '').split('&').filter(Boolean),
              impact: f[at.impact] ?? '',
              change: hgvsChange(f[at.protein]) || hgvsChange(f[at.coding]),
            }
          })
      }
    }
  }
  return () => []
}

const CHANGE_MAX = 28

// `p.Val600Glu` or `c.1799T>A`, with the transcript VEP writes before it
// (`ENSP…:p.Val600Glu`) taken off. A deletion's HGVS spells out every base.
function hgvsChange(field) {
  const change = /(?:^|:)([pcn]\.[^:]+)$/.exec(field ?? '')?.[1] ?? ''
  return change.length > CHANGE_MAX
    ? `${change.slice(0, CHANGE_MAX)}…`
    : change
}

const unique = list => [...new Set(list)]

/**
 * What the annotator said at its highest impact: the genes, what happens to
 * them, and how severe it rated that. A record spanning forty genes at MODIFIER
 * and one at HIGH is about the one.
 */
export function topAnnotation(entries) {
  const rank = e => {
    const i = IMPACTS.indexOf(e.impact)
    return i === -1 ? IMPACTS.length : i
  }
  const best = Math.min(...entries.map(rank))
  const top = entries.filter(e => rank(e) === best)
  return entries.length
    ? {
        genes: unique(top.flatMap(e => e.genes)),
        effects: unique(top.flatMap(e => e.effects)).map(e =>
          e.replaceAll('_', ' '),
        ),
        impact: top[0].impact,
        change: top.find(e => e.change)?.change ?? '',
      }
    : { genes: [], effects: [], impact: '', change: '' }
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
    annotations: annotationReader(parser),
    describe(kind, id) {
      return parser.getMetadata(kind, id)?.Description
    },
  }
}

const first = v => (Array.isArray(v) ? v[0] : v)

// An inserted sequence or forty transcripts of annotation is a kilobyte a
// reviewer never reads on a card; the VCF line still has it.
const INFO_VALUE_MAX = 96

function clip(text) {
  return text.length > INFO_VALUE_MAX
    ? `${text.slice(0, INFO_VALUE_MAX)}… (${text.length.toLocaleString('en-US')} characters)`
    : text
}

const ALLELE_MAX = 12

function clipAllele(bases) {
  return bases.length > ALLELE_MAX
    ? `${bases.slice(0, ALLELE_MAX)}…(${bases.length})`
    : bases
}

function infoRows(info) {
  return Object.entries(info).map(([key, value]) => [
    key,
    value === true
      ? ''
      : Array.isArray(value) && value.length > 3
        ? `${clip(`${value[0]}`)} and ${value.length - 1} more`
        : clip(Array.isArray(value) ? value.join(', ') : `${value}`),
  ])
}

// Past this a callset is a cohort, and a card listing every genotype is a
// matrix nobody reads off a card.
const SAMPLES_MAX = 4

function sampleRows(variant) {
  if (variant.sampleNames.length > SAMPLES_MAX) {
    return []
  }
  return Object.entries(variant.SAMPLES()).map(([name, fields]) => ({
    name,
    fields: Object.entries(fields)
      .map(([key, value]) => [
        key,
        Array.isArray(value) && value.length > 1 ? value.join(',') : first(value),
      ])
      .filter(([, value]) => value !== undefined && value !== ''),
  }))
}

function recordFacts(variant, vcf) {
  const info = variant.INFO ?? {}
  const svtype = first(info.SVTYPE)
  const ref = variant.REF ?? ''
  const [alt = ''] = variant.ALT ?? []
  const cls = svtype ? svClass(svtype) : smallVariantClass(ref, alt)
  const svlen = first(info.SVLEN)
  const inserted = first(info.SVINSLEN)
  const end = first(info.END)
  // An insertion's END is its anchor base, so END - POS says nothing of its
  // length: the caller's own SVINSLEN does, where SVLEN is absent.
  const size =
    typeof svlen === 'number'
      ? Math.abs(svlen)
      : !svtype
        ? cls === 'INS' || cls === 'DEL'
          ? Math.abs(alt.length - ref.length)
          : undefined
        : cls === 'INS'
          ? typeof inserted === 'number'
            ? inserted
            : undefined
          : typeof end === 'number' && !info.CHR2 && end > variant.POS
            ? end - variant.POS
            : undefined
  return {
    chrom: variant.CHROM,
    pos: variant.POS,
    vcfId: variant.ID?.join(',') ?? '',
    svtype: svtype ?? '',
    cls,
    size,
    // the alleles of a record that spells them out, short enough to print
    change:
      !svtype && ref && alt
        ? `${clipAllele(ref)}>${(variant.ALT ?? []).map(clipAllele).join(',')}`
        : '',
    alt: (variant.ALT ?? []).join(','),
    filter:
      variant.FILTER === 'PASS'
        ? 'PASS'
        : Array.isArray(variant.FILTER)
          ? variant.FILTER.join(';')
          : '.',
    qual: variant.QUAL ?? undefined,
    eventType: first(info.EVENTTYPE) ?? '',
    annotation: topAnnotation(vcf.annotations(info)),
    samples: sampleRows(variant),
    info: infoRows(info),
  }
}

/**
 * An image and the alignments tracks drawn in it, in track order: a set named
 * `tumor,normal` holds both in one picture, and each takes its own count.
 */
function imagesFor(sets, find) {
  return sets.map(({ name, labels, rows }) => {
    const row = find(rows)
    const counted = row?.links ?? row?.carriers
    if (counted && counted.length !== labels.length) {
      throw new Error(
        `${row.file} counts reads for ${counted.length} alignments track${counted.length === 1 ? '' : 's'} and --images names ${labels.length} (${labels.join(', ')}): name each track in the image, in track order, as --images tumor,normal=dir`,
      )
    }
    return {
      name,
      src: row?.status === 'failed' ? undefined : row && `img/${name}/${row.file}`,
      file: row?.file,
      status: row?.status ?? 'absent',
      // `reads` is the lane's supporting reads: split reads joining the panels
      // of a two-panel image, or reads with the ALT, of `depth`, in a one-panel
      lanes: labels.map((label, i) =>
        row?.links
          ? { label, reads: row.links[i] }
          : { label, ...row?.carriers?.[i] },
      ),
    }
  })
}

// What jb2export counted off the image: split reads joining the panels of a
// two-panel record, reads with the ALT at a one-panel record's variant. A read
// counted in a control is any read at all, so a noisy base in one normal read
// files a call under `control`. The classes order a queue; the picture decides
// a card.
export const SUPPORT = {
  none: 'No supporting read counted',
  control: 'Supporting reads in a control too',
  sample: 'Supporting reads in the sample only',
  uncounted: 'Not counted',
}

/**
 * What a card's counts say, in the order a reviewer wants the queue: a call no
 * read supports, a call the control carries too, a call only the sample
 * carries. The first lane is the sample under review; the rest are controls.
 */
export function supportOf([sample, ...controls]) {
  return sample?.reads === undefined
    ? 'uncounted'
    : sample.reads === 0
      ? 'none'
      : controls.some(c => c.reads > 0)
        ? 'control'
        : 'sample'
}

// FILTER is a column and the rest are INFO keys; a flag is its own name
function facetValues(variant, keys) {
  const info = variant.INFO ?? {}
  return Object.fromEntries(
    keys.flatMap(key => {
      const value =
        key === 'FILTER'
          ? Array.isArray(variant.FILTER)
            ? variant.FILTER.join(';')
            : variant.FILTER
          : info[key] === true
            ? key
            : Array.isArray(info[key])
              ? info[key].join(', ')
              : info[key]
      return value === undefined || value === null ? [] : [[key, `${value}`]]
    }),
  )
}

/**
 * One card per row of the first image set, which holds the sample under review;
 * every other set (a second caller's tracks, a control rendered apart) is
 * joined to it on the record's VCF line, or on the label for an event's image.
 *
 * `link` builds a card's live URL from its loci, or is absent.
 */
export function buildCards({ vcfText, sets, link, facets = [] }) {
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
    const evidence = find => {
      const images = imagesFor(sets, find)
      const lanes = images.flatMap(i => i.lanes)
      return { images, lanes, support: supportOf(lanes) }
    }
    const base = {
      locs: row.locs,
      event: row.event,
      url: link?.(row.locs),
    }
    if (row.line === undefined) {
      return {
        ...base,
        ...evidence(rows =>
          rows.find(r => r.line === undefined && r.event === row.event),
        ),
        id: `event:${row.event}`,
        kind: 'event',
        cls: 'EVENT',
        title: row.event,
        members: membersOf.get(row.event) ?? 0,
        genes: [],
        effects: [],
        impact: '',
        change: '',
        facets: {},
        samples: [],
        info: [],
      }
    }
    const variant = vcf.record(row.line)
    if (!variant) {
      throw new Error(
        `manifest line ${row.line} is not a record of this VCF: the manifest was rendered from a different file`,
      )
    }
    const { annotation, change, ...facts } = recordFacts(variant, vcf)
    return {
      ...base,
      ...facts,
      ...annotation,
      // the protein or coding change the annotator wrote, else the alleles. A
      // structural variant has neither: SnpEff's HGVS for one is a
      // translocation's `t(1;6)(;)(n.33053495)`.
      change: facts.svtype ? '' : annotation.change || change,
      alleles: change,
      facets: facetValues(variant, facets),
      ...evidence(rows => rows.find(r => r.line === row.line)),
      id: `${row.line}`,
      kind: 'record',
      line: row.line,
      title: facts.vcfId || `${facts.chrom}:${facts.pos.toLocaleString('en-US')}`,
    }
  })
}

/**
 * The header's own words for every FILTER, INFO and FORMAT key the cards show,
 * so a card can say what `NAF` or `Too_low_VAF` means where it prints it.
 */
export function describeKeys(vcfText, cards) {
  const vcf = readVcf(vcfText)
  const described = (kind, ids) =>
    Object.fromEntries(
      unique(ids)
        .map(id => [id, vcf.describe(kind, id)])
        .filter(([, text]) => text),
    )
  return {
    FILTER: described(
      'FILTER',
      cards.flatMap(c => (c.filter ?? '').split(';')),
    ),
    INFO: described(
      'INFO',
      cards.flatMap(c => [
        ...c.info.map(([key]) => key),
        ...Object.keys(c.facets),
      ]),
    ),
    FORMAT: described(
      'FORMAT',
      cards.flatMap(c => c.samples.flatMap(s => s.fields.map(([key]) => key))),
    ),
  }
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
