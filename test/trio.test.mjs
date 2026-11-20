import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCards, parseManifest } from '../lib/cards.mjs'
import { fromTsv, tallyVerdicts, toTsv } from '../lib/review.mjs'
import { classifyTrio } from '../lib/vendor/classifyTrio.ts'
import {
  novelCount,
  parsePedigree,
  parseRegion,
  parseTransmission,
  pickTrio,
  readTrio,
  ruleFor,
  selectSites,
  trioMembers,
  triosOf,
  trioVerdicts,
  whyOf,
} from '../lib/trio.mjs'

const KGP_PED = [
  'FamilyID SampleID FatherID MotherID Sex Population Superpopulation',
  'HG00096 HG00096 0 0 1 GBR EUR',
  'VN049 HG02024 HG02026 HG02025 2 KHV EAS',
  'VN049 HG02025 0 0 2 KHV EAS',
  'VN049 HG02026 0 0 1 KHV EAS',
].join('\n')

const KHV = ['HG02024', 'HG02025', 'HG02026']

test("1000 Genomes' pedigree is read by its header", () => {
  const pedigree = parsePedigree(KGP_PED, KHV)
  assert.deepEqual(pedigree.get('HG02024'), {
    father: 'HG02026',
    mother: 'HG02025',
    sex: 'female',
  })
  assert.equal(pedigree.has('HG00096'), false)
})

test('a headerless PLINK .fam is read by position, and FID_IID names a sample', () => {
  const fam = ['f1 kid dad mom 1 2', 'f1 dad 0 0 1 1', 'f1 mom 0 0 2 1'].join(
    '\n',
  )
  const pedigree = parsePedigree(fam, ['f1_kid', 'f1_dad', 'f1_mom'])
  assert.deepEqual(pedigree.get('f1_kid'), {
    father: 'f1_dad',
    mother: 'f1_mom',
    sex: 'male',
  })
})

test('a tab-separated line keeps an empty cell in its column', () => {
  const tsv = ['FamilyID\tSampleID\tFatherID\tMotherID\tSex', '\tkid\t\tmom\t1']
  assert.deepEqual(parsePedigree(tsv.join('\n'), ['kid', 'mom']).get('kid'), {
    father: undefined,
    mother: 'mom',
    sex: 'male',
  })
})

test('a trailing tab leaves a space-separated line read by its spaces', () => {
  assert.deepEqual(
    parsePedigree('f1 kid dad mom 2 1\t', ['kid', 'dad']).get('kid'),
    { father: 'dad', mother: 'mom', sex: 'female' },
  )
})

test('a parent of NA or -9 is no parent, unless a sample has that name', () => {
  assert.deepEqual(
    parsePedigree('f1 kid NA -9 1 1', ['kid', 'NA']).get('kid'),
    {
      father: 'NA',
      mother: undefined,
      sex: 'male',
    },
  )
})

test('a sample naming itself a parent loses that parent', () => {
  const pedigree = parsePedigree('f a a b 0 0', ['a', 'b'])
  assert.deepEqual(pedigree.get('a'), {
    father: undefined,
    mother: 'b',
    sex: undefined,
  })
})

test('the trio is the one child with a parent in the VCF, or the one --child names', () => {
  const trios = triosOf(parsePedigree(KGP_PED, KHV), KHV)
  assert.deepEqual(pickTrio(trios), {
    child: 'HG02024',
    father: 'HG02026',
    mother: 'HG02025',
    sex: 'female',
  })
  const two = [...trios, { child: 'X', mother: 'HG02025' }]
  assert.throws(() => pickTrio(two), /holds 2 trios; pick one with --child/)
  assert.equal(pickTrio(two, 'X').child, 'X')
  assert.throws(() => pickTrio(two, 'Y'), /--child Y: no trio/)
  assert.throws(() => pickTrio([]), /names no sample whose father or mother/)
})

test('a parent outside the VCF makes a duo', () => {
  const trios = triosOf(parsePedigree(KGP_PED, ['HG02024', 'HG02025']), [
    'HG02024',
    'HG02025',
  ])
  assert.deepEqual(trios, [
    { child: 'HG02024', father: undefined, mother: 'HG02025', sex: 'female' },
  ])
})

test('members say how each relates, child first; a selfed line has one parent', () => {
  assert.deepEqual(
    trioMembers({ child: 'k', father: 'f', mother: 'm', sex: 'male' }).map(
      m => `${m.sample} ${m.role} ${m.relationship}`,
    ),
    ['k child son', 'f father father', 'm mother mother'],
  )
  assert.deepEqual(
    trioMembers({ child: 'k', father: 'p', mother: 'p' }).map(
      m => `${m.sample} ${m.relationship}`,
    ),
    ['k child', 'p parent'],
  )
})

test('readTrio reads the pedigree against the VCF samples', () => {
  const { members } = readTrio({ pedigreeText: KGP_PED, samples: KHV })
  assert.deepEqual(
    members.map(m => `${m.sample} (${m.relationship})`),
    ['HG02024 (daughter)', 'HG02026 (father)', 'HG02025 (mother)'],
  )
})

test('transmission entries are checked, and match a contig by its VCF name', () => {
  const entries = parseTransmission(
    JSON.stringify([
      { refName: 'X', sex: 'male', from: 'mother' },
      { from: 'either' },
    ]),
  )
  assert.equal(ruleFor(entries, 'X').length, 2)
  assert.equal(ruleFor(entries, 'chrX').length, 1)
  assert.throws(() => parseTransmission('[{"from":"mom"}]'), /needs from/)
  assert.throws(() => parseTransmission('{}'), /JSON list/)
})

test('a region is 1-based and inclusive, commas allowed, or a contig alone', () => {
  assert.deepEqual(parseRegion('1:190,000,000-200,000,000'), {
    chrom: '1',
    start: 190_000_000,
    end: 200_000_000,
  })
  assert.deepEqual(parseRegion('chrM'), {
    chrom: 'chrM',
    start: 1,
    end: Infinity,
  })
})

const HEADER = [
  '##fileformat=VCFv4.2',
  '##FORMAT=<ID=GT,Number=1,Type=String,Description="Genotype">',
  '##FORMAT=<ID=DP,Number=1,Type=Integer,Description="Depth">',
  '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tHG02024\tHG02025\tHG02026',
]
const SITES = [
  '1\t100\t.\tA\tG\t.\tPASS\t.\tGT:DP\t0|1:20\t0|0:20\t0|0:18',
  '1\t200\t.\tC\tT\t.\tPASS\t.\tGT\t0|0\t1|0\t1|1',
  '1\t300\t.\tG\tA\t.\tPASS\t.\tGT\t0|1\t0|0\t1|1',
  '1\t400\t.\tT\tA\t.\tPASS\t.\tGT\t1|0\t1|1\t1|1',
  '2\t100\t.\tA\tG\t.\tPASS\t.\tGT\t0|1\t0|0\t0|0',
  '1\t500\t.\tA\tG\t.\tPASS\t.\tGT\t0|1\t./.\t0|0',
]
const VCF = [...HEADER, ...SITES].join('\n')
const { trio, members } = readTrio({ pedigreeText: KGP_PED, samples: KHV })

test('the queue is the flagged records of the region, header kept, in file order', () => {
  const { text, counts, kept } = selectSites(VCF, {
    trio,
    region: parseRegion('1:1-450'),
  })
  assert.deepEqual(counts, {
    deNovoCandidate: 2,
    mendelianViolation: 1,
    consistent: 1,
    unsettled: 0,
  })
  assert.equal(kept, 3)
  const lines = text.trim().split('\n')
  assert.deepEqual(lines.slice(0, HEADER.length), HEADER)
  assert.deepEqual(
    lines.slice(HEADER.length).map(l => l.split('\t')[1]),
    ['100', '200', '400'],
  )
})

test('--classes picks the classes, a no-call parent leaving a site unsettled', () => {
  const { text } = selectSites(VCF, {
    trio,
    classes: ['consistent', 'unsettled'],
  })
  assert.deepEqual(
    text
      .trim()
      .split('\n')
      .slice(HEADER.length)
      .map(l => l.split('\t')[1]),
    ['300', '500'],
  )
})

const why = (gts, extra = {}) =>
  whyOf(extra.cls ?? 'deNovoCandidate', {
    members,
    genotypes: { HG02024: gts[0], HG02026: gts[1], HG02025: gts[2] },
    ref: 'A',
    alts: ['G'],
    sex: 'female',
    rule: [],
    ...extra,
  })

test('a de novo candidate names the allele in neither parent, the REF included', () => {
  assert.deepEqual(why(['0|1', '0|0', '0|0']), {
    novel: ['1'],
    why: 'G is in neither parent',
  })
  assert.deepEqual(why(['1|0', '1|1', '1|1']), {
    novel: ['0'],
    why: 'A is in neither parent',
  })
})

test('a Mendelian violation names the parent the child shares no allele with', () => {
  assert.equal(
    why(['0|0', '1|1', '1|0'], { cls: 'mendelianViolation' }).why,
    "nothing from the father's G|G",
  )
})

test('a transmission entry narrows the violation to the parent it names', () => {
  const son = trioMembers({ ...trio, sex: 'male' })
  assert.equal(
    whyOf('mendelianViolation', {
      members: son,
      genotypes: { HG02024: '0', HG02026: '1', HG02025: '1/1' },
      ref: 'A',
      alts: ['G'],
      sex: 'male',
      rule: [{ refName: 'X', sex: 'male', from: 'mother' }],
    }).why,
    "nothing from the mother's G/G",
  )
})

test('a violation every parent shares an allele with is a split no pair of gametes makes', () => {
  // a tetraploid child with one A, where the father can give only A/A
  const gts = ['0/1/1/1', '0/0/0/0', '0/0/0/1']
  assert.equal(
    classifyTrio(gts[0], gts[1], gts[2], { sex: undefined, rule: [] }),
    'mendelianViolation',
  )
  assert.equal(
    why(gts, { cls: 'mendelianViolation' }).why,
    'no gamete from each parent makes A/G/G/G',
  )
})

test('the allele in neither parent is counted as the ALT, or as the reads without it', () => {
  const lane = { label: 'k', alt: 9, depth: 20 }
  assert.deepEqual(novelCount(lane, ['1'], 'A', ['G']), {
    bases: 'G',
    reads: 9,
    depth: 20,
    novel: true,
  })
  assert.deepEqual(novelCount(lane, ['0'], 'A', ['G']), {
    bases: 'A',
    reads: 11,
    depth: 20,
    novel: true,
  })
  assert.equal(novelCount(lane, ['2'], 'A', ['G', 'T']).novel, false)
  // an indel's reads can carry it a few bases off its column
  assert.deepEqual(novelCount(lane, ['0'], 'A', ['AAGTTAT']), {
    bases: 'AAGTTAT',
    reads: 9,
    depth: 20,
    novel: false,
  })
  assert.equal(novelCount({ label: 'k' }, ['1'], 'A', ['G']), undefined)
})

test('the verdicts fit the trio: a duo offers its one parent, keyed 1 up', () => {
  assert.deepEqual(
    trioVerdicts(members).map(b => `${b.key} ${b.label}`),
    [
      '1 Real de novo',
      '2 Missed in father',
      '3 Missed in mother',
      '4 Child miscall',
      '5 Copy-number change',
      '6 Unclear',
    ],
  )
  assert.deepEqual(
    trioVerdicts(trioMembers({ child: 'k', mother: 'm' })).map(b => b.v),
    ['deNovo', 'missed:mother', 'childMiscall', 'copyNumber', 'unclear'],
  )
})

const QUEUE = [...HEADER, ...SITES.slice(0, 4)].join('\n')
// one run of three alignments tracks, the child's first
const MANIFEST = [
  'file\tlocs\tname\tline\tevent\talt\tstatus',
  '1.png\t1:50-150\t\t5\t\t9/20,0/18,6/20\tok',
  '2.png\t1:150-250\t\t6\t\t0/22,30/30,14/28\tok',
  '3.png\t1:250-350\t\t7\t\t11/21,0/25,19/19\tok',
  '4.png\t1:350-450\t\t8\t\t15/30,19/19,17/17\tok',
].join('\n')

function trioCards() {
  return buildCards({
    vcfText: QUEUE,
    sets: [
      {
        name: 'reads',
        labels: ['HG02024', 'HG02026', 'HG02025'],
        rows: parseManifest(MANIFEST),
      },
    ],
    trio: { trio, members, transmission: [] },
  })
}

test('trio cards take the check’s class, de novo candidates first', () => {
  assert.deepEqual(
    trioCards().map(c => `${c.pos} ${c.cls}`),
    [
      '100 deNovoCandidate',
      '400 deNovoCandidate',
      '200 mendelianViolation',
      '300 consistent',
    ],
  )
})

test('a trio card lists each member’s call, fields and the novel allele’s reads', () => {
  const [site] = trioCards()
  assert.equal(site.trio.why, 'G is in neither parent')
  assert.deepEqual(
    site.trio.members.map(m => [m.sample, m.relationship, m.gt, m.fields]),
    [
      ['HG02024', 'daughter', '0|1', [['DP', 20]]],
      ['HG02026', 'father', '0|0', [['DP', 18]]],
      ['HG02025', 'mother', '0|0', [['DP', 20]]],
    ],
  )
  assert.deepEqual(site.trio.members[2].count, {
    bases: 'G',
    reads: 6,
    depth: 20,
    novel: true,
  })
})

test('the support filter reads the novel allele in the child and the parents', () => {
  const byPos = Object.fromEntries(trioCards().map(c => [c.pos, c.support]))
  // the mother's 6 G reads; the REF of a hom-alt pair, in no parent's reads
  assert.equal(byPos[100], 'control')
  assert.equal(byPos[400], 'sample')
  assert.equal(byPos[200], 'uncounted')
})

test('a trio export carries the class and genotypes, and its verdicts read back', () => {
  const cards = trioCards()
  const choices = trioVerdicts(members)
  const tsv = toTsv(cards, { 5: 'missed:mother', 6: 'copyNumber' })
  const [head, first] = tsv.split('\n')
  assert.match(head, /\ttrio_class\tgenotypes$/)
  assert.match(
    first,
    /\tmissed:mother\t\tdeNovoCandidate\tHG02024=0\|1;HG02026=0\|0;HG02025=0\|0$/,
  )
  const { changes, applied } = fromTsv(tsv, cards, choices)
  assert.deepEqual(changes, {
    5: 'missed:mother',
    6: 'copyNumber',
    7: null,
    8: null,
  })
  assert.equal(applied, 4)
  assert.deepEqual(tallyVerdicts(cards, changes, choices)['missed:mother'], 1)
})
