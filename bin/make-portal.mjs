#!/usr/bin/env node
// Turn the image directories `jb2export batch --manifest` wrote, and the VCF it
// read, into a static review portal.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import zlib from 'node:zlib'

import {
  buildCards,
  CLASSES,
  liveLink,
  parseManifest,
  SUPPORT,
} from '../lib/cards.mjs'
import { renderPage } from '../lib/page.mjs'

const HELP = `Usage: variant-review-portal --vcf <file> --images <dir> [--images <dir> ...] --out <dir>

Builds a static review page over a structural variant callset: one card per
record, its images stacked, a verdict and a link that opens the same loci live.

Render the images first, one directory per sample, from the same VCF:

  jb2export batch --vcf calls.vcf.gz --config config.json --assembly hg38 \\
    --track tumor_reads --outDir tumor --manifest
  jb2export batch --vcf calls.vcf.gz --config config.json --assembly hg38 \\
    --track normal_reads --outDir normal --manifest

  variant-review-portal --vcf calls.vcf.gz --images tumor --images normal --out portal

Options:
  --vcf       the VCF (plain or bgzipped) both runs read
  --images    a jb2export batch --outDir holding manifest.tsv; repeat for each
              sample. The first is the sample under review, and its rows are
              the cards. Write label=dir to name one; the default is the
              directory's name
  --out       directory to write the portal to
  --title     page heading (default: the VCF's file name)

  A link on every card, given all four:
  --jbrowse   URL of a JBrowse Web to open cards in
  --config    URL of the config the images were rendered from, as that JBrowse
              Web reaches it
  --assembly  assembly name
  --tracks    comma-separated trackIds to open
`

function fail(message) {
  console.error(`variant-review-portal: ${message}`)
  process.exit(1)
}

// bgzip is gzip: the magic bytes decide, not the extension
function readMaybeGzip(file) {
  const buf = fs.readFileSync(file)
  return (
    buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
  ).toString('utf8')
}

const { values } = parseArgs({
  options: {
    vcf: { type: 'string' },
    images: { type: 'string', multiple: true },
    out: { type: 'string' },
    title: { type: 'string' },
    jbrowse: { type: 'string' },
    config: { type: 'string' },
    assembly: { type: 'string' },
    tracks: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
const { vcf, images, out } = values
if (!vcf || !images?.length || !out) {
  fail('needs --vcf, at least one --images and --out. See --help.')
}

const sets = images.map(arg => {
  const eq = arg.indexOf('=')
  const dir = eq === -1 ? arg : arg.slice(eq + 1)
  const label = eq === -1 ? path.basename(path.resolve(dir)) : arg.slice(0, eq)
  const manifest = path.join(dir, 'manifest.tsv')
  if (!fs.existsSync(manifest)) {
    fail(`${manifest} not found: render ${dir} with jb2export batch --manifest`)
  }
  return { label, dir, rows: parseManifest(fs.readFileSync(manifest, 'utf8')) }
})
const labels = sets.map(s => s.label)
if (new Set(labels).size !== labels.length) {
  fail(`two --images share the label "${labels.find((l, i) => labels.indexOf(l) !== i)}": name them with label=dir`)
}

const linkOpts = [values.jbrowse, values.config, values.assembly, values.tracks]
if (linkOpts.some(Boolean) && !linkOpts.every(Boolean)) {
  fail('a live link needs all of --jbrowse, --config, --assembly and --tracks')
}
const link = values.jbrowse
  ? liveLink({
      jbrowse: values.jbrowse,
      config: values.config,
      assembly: values.assembly,
      tracks: values.tracks.split(','),
    })
  : undefined

const vcfText = readMaybeGzip(vcf)
const cards = buildCards({ vcfText, sets, link })

for (const { label, dir, rows } of sets) {
  const dest = path.join(out, 'img', label)
  fs.mkdirSync(dest, { recursive: true })
  for (const { file, status } of rows) {
    if (status !== 'failed' && fs.existsSync(path.join(dir, file))) {
      fs.copyFileSync(path.join(dir, file), path.join(dest, file))
    }
  }
}

const title = values.title ?? path.basename(vcf)
const records = cards.filter(c => c.kind === 'record').length
const events = cards.length - records
const data = {
  // verdicts are stored under this, so a portal rebuilt from the same callset
  // keeps its review and one built from another never inherits it
  portalId: crypto.createHash('sha256').update(vcfText).digest('hex').slice(0, 12),
  title,
  eyebrow: `${records} record${records === 1 ? '' : 's'}${
    events ? `, ${events} event${events === 1 ? '' : 's'}` : ''
  } · ${labels.join(' over ')}`,
  classes: CLASSES,
  support: SUPPORT,
  cards,
  footer: `Images by jb2export batch. Verdicts stay in this browser until exported.`,
}
fs.writeFileSync(path.join(out, 'index.html'), await renderPage({ data, title }))
console.log(`wrote ${cards.length} cards to ${path.join(out, 'index.html')}`)
