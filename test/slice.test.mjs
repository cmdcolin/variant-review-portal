import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  absolutize,
  readSources,
  referenceFasta,
  sliceConfig,
  windowsBed,
} from '../lib/slice.mjs'

const CONFIG = {
  assemblies: [
    {
      name: 'hg38',
      sequence: {
        adapter: {
          type: 'BgzipFastaAdapter',
          fastaLocation: { uri: 'hg38.fa.gz' },
        },
      },
    },
    { name: 'mm39', sequence: { adapter: { type: 'TwoBitAdapter', uri: 'mm39.2bit' } } },
  ],
  tracks: [
    {
      trackId: 'tumor',
      assemblyNames: ['hg38'],
      adapter: { type: 'BamAdapter', bamLocation: { uri: 'https://example.org/t.bam' } },
    },
    {
      trackId: 'normal',
      assemblyNames: ['hg38'],
      adapter: { type: 'CramAdapter', uri: 'n.cram' },
    },
    { trackId: 'genes', adapter: { type: 'Gff3TabixAdapter', uri: 'genes.gff.gz' } },
  ],
}

test('the windows of a dry run are a sorted BED, overlaps merged', () => {
  assert.equal(
    windowsBed(
      [
        '2_b.png\tchr2:101-200\tchr10:1-50',
        '1_a.png\tchr2:151-300',
        '3_c.png\tchr2:500-600',
        '',
      ].join('\n'),
    ),
    'chr10\t0\t50\nchr2\t100\t300\nchr2\t499\t600\n',
  )
})

test('a relative uri resolves against where the config was read', () => {
  const { tracks, assemblies } = absolutize(CONFIG, 'https://example.org/demo/config.json')
  assert.deepEqual(
    [
      tracks[0].adapter.bamLocation.uri,
      tracks[1].adapter.uri,
      assemblies[0].sequence.adapter.fastaLocation.uri,
    ],
    [
      'https://example.org/t.bam',
      'https://example.org/demo/n.cram',
      'https://example.org/demo/hg38.fa.gz',
    ],
  )
})

test('a track to slice is a BAM or CRAM the config can name', () => {
  assert.deepEqual(readSources(CONFIG, ['tumor', 'normal']), [
    { trackId: 'tumor', url: 'https://example.org/t.bam', assemblyName: 'hg38' },
    { trackId: 'normal', url: 'n.cram', assemblyName: 'hg38' },
  ])
  assert.throws(() => readSources(CONFIG, ['reads']), /no track "reads"/)
  assert.throws(() => readSources(CONFIG, ['genes']), /"genes" is not a BAM or CRAM/)
})

test('CRAM needs a FASTA samtools can read', () => {
  assert.equal(referenceFasta(CONFIG, 'hg38'), 'hg38.fa.gz')
  assert.equal(referenceFasta(CONFIG, 'mm39'), undefined)
})

test('the sliced config reads each named track beside itself and leaves the rest', () => {
  const { tracks } = sliceConfig(CONFIG, ['tumor', 'normal'], 'cram')
  assert.deepEqual(tracks[0].adapter, {
    type: 'CramAdapter',
    cramLocation: { uri: 'reads/tumor.cram', locationType: 'UriLocation' },
    craiLocation: { uri: 'reads/tumor.cram.crai', locationType: 'UriLocation' },
  })
  assert.equal(tracks[2], CONFIG.tracks[2])
  assert.deepEqual(sliceConfig(CONFIG, ['tumor'], 'bam').tracks[0].adapter, {
    type: 'BamAdapter',
    bamLocation: { uri: 'reads/tumor.bam', locationType: 'UriLocation' },
    index: { location: { uri: 'reads/tumor.bam.bai', locationType: 'UriLocation' } },
  })
})
