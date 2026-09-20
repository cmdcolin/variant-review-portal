import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromTsv, matches, sizeLabel, toTsv } from '../lib/review.mjs'
import {
  buildCards,
  liveLink,
  parseManifest,
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

const head = 'file\tlocs\tname\tline\tevent\tstatus'
const TUMOR = [
  head,
  '1_a.png\tchr3:24400-25600 chr10:57400-58600\ta\t8\tder3\tok',
  '2_del.png\tchr1:8400-9772\t\t9\t\tok',
  '3_ins.png\tchr1:4400-5600\tins1\t10\t\tfailed',
  'event_1_der3.png\tchr3:24400-26000 chr10:57400-58800 chr12:71400-72800\tder3\t\tder3\tok',
].join('\n')
// a control rendered with --limit 2: the insertion and the event are absent
const NORMAL = [head, ...TUMOR.split('\n').slice(1, 3)].join('\n')

function cards(link) {
  return buildCards({
    vcfText: VCF,
    link,
    sets: [
      { label: 'tumor', rows: parseManifest(TUMOR) },
      { label: 'normal', rows: parseManifest(NORMAL) },
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
    { label: 'tumor', src: 'img/tumor/1_a.png', status: 'ok' },
    { label: 'normal', src: 'img/normal/1_a.png', status: 'ok' },
  ])
  assert.deepEqual(ins.images, [
    { label: 'tumor', src: undefined, status: 'failed' },
    { label: 'normal', src: undefined, status: 'absent' },
  ])
  assert.equal(event.images[1].status, 'absent')
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
        sets: [{ label: 't', rows: parseManifest(`${head}\nx.png\tchr1:1-2\t\t99\t\tok`) }],
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
