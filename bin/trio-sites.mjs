#!/usr/bin/env node
import fs from 'node:fs'
import { parseArgs } from 'node:util'

import { readVcf } from '../lib/cards.mjs'
import { readVcfText } from '../lib/files.mjs'
import {
  DEFAULT_TRIO_CLASSES,
  parseRegion,
  parseTransmission,
  readTrio,
  selectSites,
  TRIO_CLASSES,
} from '../lib/trio.mjs'

const HELP = `Usage: variant-review-trio-sites --vcf <file> --pedigree <file> --out <file>

Writes the sites of a trio VCF where JBrowse's Mendelian check flags the
child's genotype, as a VCF for jb2export batch --sites and variant-review-portal.

  variant-review-trio-sites --vcf trio.vcf.gz --pedigree family.ped \\
    --region chr1:190000000-200000000 --out sites.vcf

Options:
  --vcf           the trio's VCF (plain or bgzipped)
  --pedigree      a PLINK .fam or .ped, or a table whose header names SampleID or
                  IID, FatherID or PAT, MotherID or MAT and Sex, as 1000 Genomes'
                  20130606_g1k_3202_samples_ped_population.txt does
  --child         the child whose trio to check, where the VCF holds several
  --classes       the classes to keep, comma separated (default:
                  ${DEFAULT_TRIO_CLASSES.join(',')}); also consistent, unsettled
  --region        chrom:start-end, 1-based and inclusive, or a contig alone
  --transmission  a JSON list of { refName, sex, from } entries, the assembly's
                  transmission slot, for sex chromosomes and organelles; refName
                  is the VCF's CHROM. Left out, every contig takes the
                  autosomal rule
  --out           the VCF to write
`

function fail(message) {
  console.error(`variant-review-trio-sites: ${message}`)
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    vcf: { type: 'string' },
    pedigree: { type: 'string' },
    child: { type: 'string' },
    classes: { type: 'string' },
    region: { type: 'string' },
    transmission: { type: 'string' },
    out: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(HELP)
  process.exit(0)
}
if (!values.vcf || !values.pedigree || !values.out) {
  fail('needs --vcf, --pedigree and --out. See --help.')
}
const classes = values.classes
  ? values.classes.split(',').map(c => c.trim())
  : DEFAULT_TRIO_CLASSES
const unknown = classes.filter(c => !Object.hasOwn(TRIO_CLASSES, c))
if (unknown.length) {
  fail(
    `--classes ${unknown.join(',')}: the classes are ${Object.keys(TRIO_CLASSES).join(', ')}`,
  )
}

try {
  const vcfText = readVcfText(values.vcf)
  const { trio, members } = readTrio({
    pedigreeText: fs.readFileSync(values.pedigree, 'utf8'),
    samples: readVcf(vcfText).samples,
    child: values.child,
  })
  const { text, counts, kept } = selectSites(vcfText, {
    trio,
    classes,
    region: values.region ? parseRegion(values.region) : undefined,
    transmission: values.transmission
      ? parseTransmission(fs.readFileSync(values.transmission, 'utf8'))
      : [],
  })
  fs.writeFileSync(values.out, text)
  console.log(
    `${members.map(m => `${m.sample} (${m.relationship})`).join(', ')}: ${Object.entries(
      counts,
    )
      .filter(([, n]) => n)
      .map(([c, n]) => `${TRIO_CLASSES[c]} ${n}`)
      .join(', ')}. Wrote ${kept} sites to ${values.out}`,
  )
} catch (error) {
  fail(error.message)
}
