import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  fromHash,
  fromTsv,
  matches,
  sizeLabel,
  sortCards,
  sortOptions,
  toHash,
  toTsv,
} from '../lib/review.mjs'
import {
  buildCards,
  describeKeys,
  liveLink,
  parseManifest,
  supportOf,
  svClass,
} from '../lib/cards.mjs'

const VCF = [
  '##fileformat=VCFv4.4',
  '##INFO=<ID=SVTYPE,Number=1,Type=String,Description="">',
  '##INFO=<ID=SVLEN,Number=A,Type=Integer,Description="">',
  '##INFO=<ID=END,Number=1,Type=Integer,Description="">',
  '##INFO=<ID=EVENT,Number=A,Type=String,Description="">',
  '##INFO=<ID=EVENTTYPE,Number=A,Type=String,Description="">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
  'chr3\t25000\ta\tN\tN[chr10:58000[\t60\tPASS\tSVTYPE=BND;EVENT=der3;EVENTTYPE=CHROMOPLEXY',
  'chr1\t9000\t.\tN\t<DEL>\t.\tLowQual\tSVTYPE=DEL;END=9172;SVLEN=-172',
  'chr1\t5000\tins1\tN\t<INS>\t.\tPASS\tSVTYPE=INS;SVLEN=312',
].join('\n')

const head = 'file\tlocs\tname\tline\tevent\tlinks\tstatus'
const TUMOR = [
  head,
  '1_a.png\tchr3:24400-25600 chr10:57400-58600\ta\t8\tder3\t29\tok',
  '2_del.png\tchr1:8400-9772\t\t9\t\t\tok',
  '3_ins.png\tchr1:4400-5600\tins1\t10\t\t\tfailed',
  'event_1_der3.png\tchr3:24400-26000 chr10:57400-58800 chr12:71400-72800\tder3\t\tder3\t33\tok',
].join('\n')
// a control rendered with --limit 2: the insertion and the event are absent,
// and no read of it joins the junction's panels
const NORMAL = [
  head,
  '1_a.png\tchr3:24400-25600 chr10:57400-58600\ta\t8\tder3\t0\tok',
  '2_del.png\tchr1:8400-9772\t\t9\t\t\tok',
].join('\n')

function cards(link) {
  return buildCards({
    vcfText: VCF,
    link,
    sets: [
      { name: 'tumor', labels: ['tumor'], rows: parseManifest(TUMOR) },
      { name: 'normal', labels: ['normal'], rows: parseManifest(NORMAL) },
    ],
  })
}

test('a manifest from before the line column is refused by name', () => {
  assert.throws(
    () => parseManifest('file\tloc1\tloc2\tname\tstatus\nx.png\ta\tb\tn\tok'),
    /no locs, line, event column.*predates/,
  )
})

test('a card carries the facts of the VCF line its manifest row names', () => {
  const [bnd, del, ins] = cards()
  assert.deepEqual(
    [bnd.cls, bnd.title, bnd.filter, bnd.qual, bnd.event, bnd.eventType],
    ['BND', 'a', 'PASS', 60, 'der3', 'CHROMOPLEXY'],
  )
  // no ID: titled by where it is, and keyed by its line either way
  assert.deepEqual(
    [del.cls, del.title, del.size, del.filter, del.id],
    ['DEL', 'chr1:9,000', 172, 'LowQual', '9'],
  )
  assert.deepEqual([ins.cls, ins.size], ['INS', 312])
})

test('every image set joins on the line, and says why one is missing', () => {
  const [bnd, , ins, event] = cards()
  assert.deepEqual(bnd.images, [
    {
      name: 'tumor',
      src: 'img/tumor/1_a.png',
      file: '1_a.png',
      status: 'ok',
      lanes: [{ label: 'tumor', links: 29 }],
    },
    {
      name: 'normal',
      src: 'img/normal/1_a.png',
      file: '1_a.png',
      status: 'ok',
      lanes: [{ label: 'normal', links: 0 }],
    },
  ])
  assert.deepEqual(
    ins.images.map(i => [i.src, i.status]),
    [
      [undefined, 'failed'],
      [undefined, 'absent'],
    ],
  )
  assert.equal(event.images[1].status, 'absent')
})

// one run with both alignments tracks: one picture, a count for each
const BOTH = [
  head,
  '1_a.png\tchr3:24400-25600 chr10:57400-58600\ta\t8\tder3\t29,2\tok',
  '2_del.png\tchr1:8400-9772\t\t9\t\t\tok',
].join('\n')

test('one image of two tracks is one picture with a count for each track', () => {
  const [bnd, del] = buildCards({
    vcfText: VCF,
    sets: [
      { name: 'tumor_normal', labels: ['tumor', 'normal'], rows: parseManifest(BOTH) },
    ],
  })
  assert.deepEqual(
    [bnd.images.length, bnd.images[0].src, bnd.lanes, bnd.support],
    [
      1,
      'img/tumor_normal/1_a.png',
      [
        { label: 'tumor', links: 29 },
        { label: 'normal', links: 2 },
      ],
      'control',
    ],
  )
  assert.deepEqual(
    [del.lanes.map(l => l.links), del.support],
    [[undefined, undefined], 'uncounted'],
  )
})

test('an image counting more tracks than --images names is refused', () => {
  assert.throws(
    () =>
      buildCards({
        vcfText: VCF,
        sets: [{ name: 't', labels: ['t'], rows: parseManifest(BOTH) }],
      }),
    /1_a.png counts split reads for 2 alignments tracks and --images names 1 \(t\)/,
  )
})

test('the counts on a card’s lanes say how far the reads support it', () => {
  const lane = links => ({ links })
  assert.deepEqual(
    [
      supportOf([lane(0), lane(0)]),
      supportOf([lane(12), lane(3)]),
      supportOf([lane(12), lane(0)]),
      // one panel, or a control that was never counted
      supportOf([lane(undefined), lane(5)]),
      supportOf([lane(12), lane(undefined)]),
    ],
    ['none', 'control', 'sample', 'uncounted', 'sample'],
  )
  const [bnd, del] = cards()
  assert.deepEqual([bnd.support, del.support], ['sample', 'uncounted'])
})

test('a manifest with no links column still builds cards, uncounted', () => {
  const old = 'file\tlocs\tname\tline\tevent\tstatus'
  const [card] = buildCards({
    vcfText: VCF,
    sets: [
      {
        name: 't',
        labels: ['t'],
        rows: parseManifest(`${old}\n1_a.png\tchr3:1-2 chr10:3-4\ta\t8\tder3\tok`),
      },
    ],
  })
  assert.equal(card.support, 'uncounted')
})

test('the support filter leaves the cards of one kind', () => {
  const all = cards()
  const filter = {
    cls: 'all',
    event: 'all',
    support: 'sample',
    verdictFilter: 'all',
    q: '',
    verdicts: {},
  }
  assert.deepEqual(
    all.filter(c => matches(c, filter)).map(c => c.id),
    ['8', 'event:der3'],
  )
})

test('an event row is a card of its own, counting its records', () => {
  const event = cards().at(-1)
  assert.deepEqual(
    [event.id, event.kind, event.cls, event.members, event.locs.length],
    ['event:der3', 'event', 'EVENT', 1, 3],
  )
})

test('a manifest rendered from another VCF is refused', () => {
  assert.throws(
    () =>
      buildCards({
        vcfText: VCF,
        sets: [{ name: 't', labels: ['t'], rows: parseManifest(`${head}\nx.png\tchr1:1-2\t\t99\t\tok`) }],
      }),
    /line 99 is not a record of this VCF/,
  )
})

test('a caller’s TRA is a breakend and DUP:TANDEM a duplication', () => {
  assert.deepEqual(
    ['TRA', 'DUP:TANDEM', 'CPX', undefined].map(svClass),
    ['BND', 'DUP', 'OTHER', 'OTHER'],
  )
})

test('a link opens several loci as a split view and one as a linear view', () => {
  const link = liveLink({
    jbrowse: 'https://example.org/jb2/',
    config: 'https://example.org/c.json',
    assembly: 'hg38',
    tracks: ['t', 'n'],
  })
  const spec = url =>
    JSON.parse(decodeURIComponent(url.split('&session=spec-')[1]))
  assert.deepEqual(spec(link(['chr1:1-2', 'chr5:3-4'])), {
    views: [
      {
        type: 'BreakpointSplitView',
        views: [
          { loc: 'chr1:1-2', assembly: 'hg38', tracks: ['t', 'n'] },
          { loc: 'chr5:3-4', assembly: 'hg38', tracks: ['t', 'n'] },
        ],
      },
    ],
  })
  assert.deepEqual(spec(link(['chr1:1-2'])), {
    views: [
      { type: 'LinearGenomeView', loc: 'chr1:1-2', assembly: 'hg38', tracks: ['t', 'n'] },
    ],
  })
})

test('the event filter keeps an event’s card beside its records', () => {
  const all = cards()
  const filter = { cls: 'all', event: 'der3', verdictFilter: 'all', q: '', verdicts: {} }
  assert.deepEqual(
    all.filter(c => matches(c, filter)).map(c => c.id),
    ['8', 'event:der3'],
  )
})

test('verdicts round-trip through the exported TSV', () => {
  const all = cards()
  const tsv = toTsv(all, { 8: 'real', 'event:der3': 'artifact' })
  const { changes, applied, unknown } = fromTsv(tsv, all)
  assert.deepEqual(
    [changes['8'], changes['event:der3'], changes['9'], applied, unknown],
    ['real', 'artifact', null, 4, 0],
  )
})

test('sizes read in the unit a reviewer says them in', () => {
  assert.deepEqual(
    [172, 6430, 4_500_000, undefined].map(sizeLabel),
    ['172 bp', '6.4 kb', '4.5 Mb', ''],
  )
})

const ANNOTATED = [
  '##fileformat=VCFv4.3',
  '##FILTER=<ID=Too_low_VAF,Description="Allele fraction inferred to be low">',
  '##INFO=<ID=SVTYPE,Number=1,Type=String,Description="Type of structural variant">',
  '##INFO=<ID=SVLEN,Number=1,Type=Integer,Description="Length difference">',
  '##INFO=<ID=SVINSSEQ,Number=1,Type=String,Description="Sequence of insertion">',
  `##INFO=<ID=ANN,Number=.,Type=String,Description="Functional annotations: 'Allele | Annotation | Annotation_Impact | Gene_Name | Gene_ID' ">`,
  '##FORMAT=<ID=AF,Number=1,Type=Float,Description="Allele frequency in the tumor BAM">',
  '##FORMAT=<ID=NAF,Number=1,Type=Float,Description="Allele frequency in the normal BAM">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tT',
  'chr1\t100\tfus\tN\t]chr16:500]N\t.\tToo_low_VAF\tSVTYPE=BND;ANN=x|intron_variant|MODIFIER|FAR|g1,x|gene_fusion&frameshift_variant|HIGH|NUP93&UCK2|g2,x|gene_fusion|HIGH|NUP93&UCK2|g2\tAF:NAF\t0.04:0.01',
  `chr2\t200\tins\tN\t<INS>\t.\tPASS\tSVTYPE=INS;SVLEN=300;SVINSSEQ=${'ACGT'.repeat(75)}\tAF:NAF\t0.7:0`,
].join('\n')

function annotated() {
  return buildCards({
    vcfText: ANNOTATED,
    sets: [
      {
        name: 't',
        labels: ['t'],
        rows: parseManifest(
          `${head}\n1.png\tchr1:1-200 chr16:400-600\tfus\t10\t\t4\tok\n2.png\tchr2:1-400\tins\t11\t\t\tok`,
        ),
      },
    ],
  })
}

test('a card names the genes and effect of its highest-impact annotation', () => {
  const [fus, ins] = annotated()
  assert.deepEqual(
    [fus.genes, fus.effects, fus.impact],
    [['NUP93', 'UCK2'], ['gene fusion', 'frameshift variant'], 'HIGH'],
  )
  assert.deepEqual([ins.genes, ins.impact], [[], ''])
})

test('a card carries its sample columns and its INFO, long values clipped', () => {
  const [fus, ins] = annotated()
  assert.deepEqual(fus.samples, [
    {
      name: 'T',
      fields: [
        ['AF', 0.04],
        ['NAF', 0.01],
      ],
    },
  ])
  const seq = Object.fromEntries(ins.info).SVINSSEQ
  assert.match(seq, /^(ACGT){24}… \(300 characters\)$/)
})

test('the header’s descriptions come with the keys the cards print', () => {
  const described = describeKeys(ANNOTATED, annotated())
  assert.equal(described.FILTER.Too_low_VAF, 'Allele fraction inferred to be low')
  assert.equal(described.FORMAT.NAF, 'Allele frequency in the normal BAM')
  assert.equal(described.INFO.SVLEN, 'Length difference')
})

test('search takes every word, across genes, effects and loci', () => {
  const all = annotated()
  const found = q => all.filter(c => matches(c, { q, verdicts: {} })).map(c => c.title)
  assert.deepEqual(found('uck2 fusion'), ['fus'])
  assert.deepEqual(found('chr2'), ['ins'])
  assert.deepEqual(found('uck2 chr2'), [])
  assert.deepEqual(
    all.filter(c => matches(c, { impact: 'HIGH', verdicts: {} })).map(c => c.title),
    ['fus'],
  )
})

test('a callset sorts on any number its cards carry, the rest last', () => {
  const all = annotated()
  assert.deepEqual(
    sortOptions(all).map(([key]) => key),
    ['callset', 'size', 'links', 'format:AF', 'format:NAF'],
  )
  const order = sort => sortCards(all, sort).map(c => c.title)
  assert.deepEqual(order('format:AF'), ['ins', 'fus'])
  assert.deepEqual(order('links'), ['fus', 'ins'])
  assert.deepEqual(order('size'), ['ins', 'fus'])
  assert.deepEqual(order('callset'), ['fus', 'ins'])
})

test('the address carries what differs from a fresh page, and reads back', () => {
  assert.equal(toHash({}), '')
  const hash = toHash({ cls: 'DEL', q: 'chr1 fusion', sort: 'size', card: '12' })
  assert.equal(hash, '#cls=DEL&q=chr1+fusion&sort=size&card=12')
  const back = fromHash(hash)
  assert.deepEqual(
    [back.cls, back.q, back.sort, back.card, back.view, back.support],
    ['DEL', 'chr1 fusion', 'size', '12', 'cards', 'all'],
  )
})

test('a note travels with its verdict through export and import', () => {
  const all = annotated()
  const tsv = toTsv(all, { 10: 'real' }, { 10: 'clean\tfan', 11: 'homopolymer' })
  const [headRow, first] = tsv.split('\n')
  assert.ok(headRow.endsWith('split_reads\tsupport\tverdict\tnote'))
  assert.ok(first.endsWith('NUP93,UCK2\tHIGH\tt=4\tsample\treal\tclean fan'))
  const back = fromTsv(tsv, all)
  assert.deepEqual(back.changes, { 10: 'real', 11: null })
  assert.deepEqual(back.notes, { 10: 'clean fan', 11: 'homopolymer' })
})

test('an insertion with no SVLEN is as long as its SVINSLEN, never END - POS', () => {
  const vcfText = [
    '##fileformat=VCFv4.3',
    '##INFO=<ID=SVTYPE,Number=1,Type=String,Description="">',
    '##INFO=<ID=END,Number=1,Type=Integer,Description="">',
    '##INFO=<ID=SVINSLEN,Number=1,Type=Integer,Description="">',
    '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
    'chr1\t100\ta\tN\t<INS>\t.\tPASS\tSVTYPE=INS;END=124;SVINSLEN=348',
    'chr1\t900\tb\tN\t<INS>\t.\tPASS\tSVTYPE=INS;END=902',
  ].join('\n')
  const rows = parseManifest(
    `${head}\na.png\tchr1:1-700\ta\t6\t\t\tok\nb.png\tchr1:300-1500\tb\t7\t\t\tok`,
  )
  assert.deepEqual(
    buildCards({ vcfText, sets: [{ name: 't', labels: ['t'], rows }] }).map(
      c => c.size,
    ),
    [348, undefined],
  )
})
