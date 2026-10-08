#!/usr/bin/env node
// Cut a callset's reads down to the windows its cards draw, and write a config
// that reads the slices, so a portal carries the reads its links open.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  absolutize,
  readSources,
  referenceFasta,
  sliceConfig,
  sliceFile,
  windowsBed,
} from '../lib/slice.mjs'

const HELP = `Usage: variant-review-slice --vcf <file> --config <file|URL> --tracks <ids> --out <dir>

Slices the reads of a callset to the windows jb2export batch draws, into the
directory the portal will be built in:

  <dir>/reads/<trackId>.cram   the reads of each track that touch a window
  <dir>/config.json            the config, with those tracks reading the slices

Render and build from that config, and the portal's links open reads it holds
itself:

  variant-review-slice --vcf calls.vcf.gz --config config.json \\
    --tracks tumor_reads,normal_reads --out portal

  jb2export batch --vcf calls.vcf.gz --config portal/config.json --assembly hg38 \\
    --track tumor_reads --track normal_reads --outDir reads --manifest

  variant-review-portal --vcf calls.vcf.gz --images tumor,normal=reads --out portal \\
    --jbrowse https://jbrowse.org/code/jb2/latest/ \\
    --config https://example.org/portal/config.json

Worth it where the reads are somewhere a browser reaches slowly or not at all. A
slice holds whole reads, so long reads make it some hundreds of megabytes for a
few hundred records, and a link shows reads at the cards' windows only.

Needs samtools and jb2export on the PATH.

Options:
  --vcf       the VCF the images are rendered from
  --config    the JBrowse config holding the tracks, a file or a URL
  --tracks    comma-separated trackIds of the BAM or CRAM tracks to slice
  --out       the portal directory
  --flank     as given to jb2export batch, if it is
  --passOnly  as given to jb2export batch, if it is
  --format    cram or bam (default: cram where the assembly is a FASTA
              samtools can read, else bam)
`

function fail(message) {
  console.error(`variant-review-slice: ${message}`)
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 2 ** 28,
  })
  if (result.error?.code === 'ENOENT') {
    fail(`${command} is not on the PATH`)
  }
  return result
}

const { values } = parseArgs({
  options: {
    vcf: { type: 'string' },
    config: { type: 'string' },
    tracks: { type: 'string' },
    out: { type: 'string' },
    flank: { type: 'string' },
    passOnly: { type: 'boolean' },
    format: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})
if (values.help) {
  console.log(HELP)
  process.exit(0)
}
const { vcf, config: configArg, tracks, out } = values
if (!vcf || !configArg || !tracks || !out) {
  fail('needs --vcf, --config, --tracks and --out. See --help.')
}
if (values.format && !['cram', 'bam'].includes(values.format)) {
  fail('--format is cram or bam')
}

const isUrl = /^https?:\/\//.test(configArg)
const base = isUrl ? configArg : pathToFileURL(path.resolve(configArg)).href
const text = isUrl
  ? await fetch(configArg).then(r =>
      r.ok ? r.text() : fail(`${configArg} answered HTTP ${r.status}`),
    )
  : fs.readFileSync(configArg, 'utf8')
const config = absolutize(JSON.parse(text), base)
const trackIds = tracks.split(',').filter(Boolean)

let sources
try {
  sources = readSources(config, trackIds)
} catch (error) {
  fail(error.message)
}

const dryRun = run('jb2export', [
  'batch',
  '--vcf',
  vcf,
  '--dryRun',
  ...(values.flank ? ['--flank', values.flank] : []),
  ...(values.passOnly ? ['--passOnly'] : []),
])
if (dryRun.status !== 0) {
  fail(`jb2export batch --dryRun failed:\n${dryRun.stderr}`)
}
const bed = windowsBed(dryRun.stdout)
fs.mkdirSync(path.join(out, 'reads'), { recursive: true })
const bedFile = path.join(out, 'reads', 'windows.bed')
fs.writeFileSync(bedFile, bed)

// a file:// reference is a path to samtools
const local = url =>
  url.startsWith('file://') ? decodeURIComponent(new URL(url).pathname) : url

// One assembly's reads per run: a CRAM is written against one reference
const reference = referenceFasta(config, sources[0].assemblyName)
const format = values.format ?? (reference ? 'cram' : 'bam')
if (format === 'cram' && !reference) {
  fail(
    `the assembly of "${sources[0].trackId}" is not a FASTA samtools can read, so its reads cannot be written as CRAM: pass --format bam`,
  )
}

// A range request that gets no answer is the caller's to retry, and a remote
// BAM answers a few hundred of them here
const TRIES = 5

for (const { trackId, url } of sources) {
  const file = path.join(out, sliceFile(trackId, format))
  let done = false
  for (let attempt = 1; attempt <= TRIES && !done; attempt++) {
    const view = run('samtools', [
      'view',
      '-M',
      '-L',
      bedFile,
      ...(reference ? ['-T', local(reference)] : []),
      format === 'cram' ? '-C' : '-b',
      '-o',
      file,
      local(url),
    ])
    done = view.status === 0
    if (!done) {
      console.error(
        `${trackId}: attempt ${attempt} of ${TRIES} failed: ${view.stderr.trim().split('\n').at(-1)}`,
      )
    }
  }
  if (!done) {
    fail(`could not slice "${trackId}" from ${url}`)
  }
  const index = run('samtools', ['index', file])
  if (index.status !== 0) {
    fail(`samtools index ${file} failed:\n${index.stderr}`)
  }
  console.log(
    `${file}  ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`,
  )
}

fs.writeFileSync(
  path.join(out, 'config.json'),
  `${JSON.stringify(sliceConfig(config, trackIds, format), null, 2)}\n`,
)
console.log(
  `wrote ${path.join(out, 'config.json')}: render with jb2export batch --config ${path.join(out, 'config.json')}`,
)
