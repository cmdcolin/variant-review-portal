// A trio from a pedigree, the Mendelian check at each site, and what a card
// says about it. Pure: the tests hand it strings.
import { classifyTrio } from './classifyTrio.mjs'

export const TRIO_CLASSES = {
  deNovoCandidate: 'De novo candidate',
  mendelianViolation: 'Mendelian violation',
  consistent: 'Consistent',
  unsettled: 'Not settled',
}

export const DEFAULT_TRIO_CLASSES = ['deNovoCandidate', 'mendelianViolation']

// what the reads of the allele no parent is called with say, in the order the queue
// takes them
export const TRIO_SUPPORT = {
  none: 'No child read has it',
  control: "A parent's reads have it too",
  sample: "Only the child's reads have it",
  uncounted: 'Not counted',
}

// JBrowse's pedigreeLocation reads the same columns (plugins/variants
// shared/pedigree.ts)
const HEADER_NAMES = {
  sample: ['sampleid', 'iid'],
  father: ['fatherid', 'pat'],
  mother: ['motherid', 'mat'],
  family: ['familyid', 'fid'],
  sex: ['sex'],
}

const PLINK_COLUMNS = { family: 0, sample: 1, father: 2, mother: 3, sex: 4 }

const MISSING_CODES = new Set(['', '0', '-9', 'na', 'unknown'])

const isMissingCode = code => MISSING_CODES.has(`${code}`.toLowerCase())

/**
 * `1`, `m` or `male` is male, `2`, `f` or `female` female, `0`, `-9`, `NA`,
 * `unknown` or nothing none
 */
export function pedigreeSexOf(code) {
  const lower = `${code}`.toLowerCase()
  return isMissingCode(lower)
    ? undefined
    : lower === '1' || lower === 'm' || lower === 'male'
      ? 'male'
      : lower === '2' || lower === 'f' || lower === 'female'
        ? 'female'
        : 'other'
}

function headerColumns(cells) {
  const names = cells.map(cell => cell.replace(/^#/, '').toLowerCase())
  return names.some(name => HEADER_NAMES.sample.includes(name))
    ? Object.fromEntries(
        Object.entries(HEADER_NAMES)
          .map(([column, aliases]) => [
            column,
            names.findIndex(name => aliases.includes(name)),
          ])
          .filter(([, index]) => index !== -1),
      )
    : undefined
}

/**
 * The father, mother and sex of each sample of `names` the pedigree lists,
 * keyed by its VCF name. A first row naming `SampleID` or `IID` is a header;
 * anything else is headerless PLINK. A line holding a tab splits on tabs, so
 * an empty cell keeps its column. An IID naming no sample is tried as
 * `FID_IID`, and a parent of `0`, `-9`, `NA` or nothing, unless a sample has
 * that name, or the sample itself, is no parent.
 */
export function parsePedigree(text, names) {
  const rows = text
    .split(/\r\n|\r|\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line =>
      line.includes('\t')
        ? line.split('\t').map(cell => cell.trim())
        : line.trim().split(/\s+/),
    )
  const header = rows[0] ? headerColumns(rows[0]) : undefined
  const columns = header ?? PLINK_COLUMNS
  const nameSet = new Set(names)
  const pedigree = new Map()
  for (const cells of header ? rows.slice(1) : rows) {
    const cell = column =>
      columns[column] === undefined || cells[columns[column]] === ''
        ? undefined
        : cells[columns[column]]
    const family = cell('family')
    const vcfName = id =>
      nameSet.has(id)
        ? id
        : family !== undefined && nameSet.has(`${family}_${id}`)
          ? `${family}_${id}`
          : undefined
    const iid = cell('sample')
    const name = iid === undefined ? undefined : vcfName(iid)
    if (name !== undefined && !pedigree.has(name)) {
      const parentOf = column => {
        const id = cell(column)
        const parent =
          id === undefined
            ? undefined
            : (vcfName(id) ?? (isMissingCode(id) ? undefined : id))
        return parent === name ? undefined : parent
      }
      const sexCode = cell('sex')
      pedigree.set(name, {
        father: parentOf('father'),
        mother: parentOf('mother'),
        sex: sexCode === undefined ? undefined : pedigreeSexOf(sexCode),
      })
    }
  }
  return pedigree
}

/**
 * Each sample with a father or mother among `names`: a trio, or a duo where
 * one parent is missing. A parent the pedigree names outside the VCF is left
 * out.
 */
export function triosOf(pedigree, names) {
  const present = id =>
    id !== undefined && names.includes(id) ? id : undefined
  return [...pedigree]
    .map(([child, { father, mother, sex }]) => ({
      child,
      father: present(father),
      mother: present(mother),
      sex,
    }))
    .filter(t => t.father !== undefined || t.mother !== undefined)
    .toSorted((a, b) => a.child.localeCompare(b.child))
}

const describeTrio = t =>
  `${t.child} (${[t.father, t.mother].filter(Boolean).join(', ')})`

/** The trio `child` names, or the only one there is. */
export function pickTrio(trios, child) {
  const picked =
    child === undefined
      ? trios.length === 1
        ? trios[0]
        : undefined
      : trios.find(t => t.child === child)
  if (!picked) {
    throw new Error(
      trios.length === 0
        ? "the pedigree names no sample whose father or mother is among the VCF's samples"
        : child === undefined
          ? `the VCF holds ${trios.length} trios; pick one with --child: ${trios.map(describeTrio).join(', ')}`
          : `--child ${child}: no trio has that child. The VCF's trios: ${trios.map(describeTrio).join(', ')}`,
    )
  }
  return picked
}

const CHILD_TERMS = { male: 'son', female: 'daughter' }

/**
 * The trio's samples, child first, each with the word for how it relates.
 * A father who is also the mother is a selfed line's one parent.
 */
export function trioMembers({ child, father, mother, sex }) {
  const parents =
    father !== undefined && father === mother
      ? [{ role: 'parent', sample: father }]
      : [
          ...(father === undefined ? [] : [{ role: 'father', sample: father }]),
          ...(mother === undefined ? [] : [{ role: 'mother', sample: mother }]),
        ]
  return [
    {
      role: 'child',
      sample: child,
      relationship: CHILD_TERMS[sex] ?? 'child',
    },
    ...parents.map(p => ({ ...p, relationship: p.role })),
  ]
}

const FROM = ['mother', 'father', 'either']
const SEXES = ['male', 'female', 'other']

/**
 * The assembly's `transmission` slot as JSON: entries of `refName`, `sex` and
 * `from`, for the contigs a child does not inherit one copy from each parent.
 */
export function parseTransmission(text) {
  const entries = JSON.parse(text)
  if (!Array.isArray(entries)) {
    throw new TypeError(
      '--transmission: expected a JSON list of { refName, sex, from } entries',
    )
  }
  for (const entry of entries) {
    if (
      !FROM.includes(entry?.from) ||
      (entry.sex !== undefined && !SEXES.includes(entry.sex)) ||
      (entry.refName !== undefined && typeof entry.refName !== 'string')
    ) {
      throw new TypeError(
        `--transmission: ${JSON.stringify(entry)} needs from as one of ${FROM.join(', ')}, and sex, where given, as one of ${SEXES.join(', ')}`,
      )
    }
  }
  return entries
}

/** The entries for a contig, by its name in the VCF; no refName is every contig */
export function ruleFor(transmission, chrom) {
  return transmission.filter(
    e => e.refName === undefined || e.refName === chrom,
  )
}

/**
 * The trio's class at a site, from `genotypeOf`, a sample's GT there. A parent
 * with no GT is a no-call, and a child with none is no call to make.
 */
export function classifySite(trio, genotypeOf, rule) {
  const child = genotypeOf(trio.child)
  const parent = name =>
    name === undefined ? undefined : (genotypeOf(name) ?? '.')
  return child === undefined
    ? undefined
    : classifyTrio(child, parent(trio.father), parent(trio.mother), {
        sex: trio.sex,
        rule,
      })
}

const toNumber = text => Number(text.replaceAll(',', ''))

/** `1:190000000-200000000`, or a contig alone, 1-based and inclusive */
export function parseRegion(text) {
  const trimmed = text.trim()
  const match = /^(.+):([\d,]+)-([\d,]+)$/.exec(trimmed)
  return match
    ? { chrom: match[1], start: toNumber(match[2]), end: toNumber(match[3]) }
    : { chrom: trimmed, start: 1, end: Infinity }
}

function lineGenotypes(fields, columnOf) {
  const at = (fields[8] ?? '').split(':').indexOf('GT')
  return sample => {
    const column = columnOf.get(sample)
    return at === -1 || column === undefined
      ? undefined
      : fields[9 + column]?.split(':')[at]
  }
}

/**
 * The records of a VCF whose trio class is one of `classes`, with the VCF's
 * header and in its order, and a count of every class over the region.
 */
export function selectSites(
  vcfText,
  { trio, classes = DEFAULT_TRIO_CLASSES, region, transmission = [] },
) {
  const lines = vcfText.split('\n').filter(Boolean)
  const header = lines.filter(l => l.startsWith('#'))
  const samples = (header.at(-1) ?? '').split('\t').slice(9)
  const columnOf = new Map(samples.map((s, i) => [s, i]))
  const counts = Object.fromEntries(Object.keys(TRIO_CLASSES).map(c => [c, 0]))
  const kept = []
  for (const line of lines) {
    if (!line.startsWith('#')) {
      const fields = line.split('\t')
      const pos = Number(fields[1])
      if (
        !region ||
        (fields[0] === region.chrom && pos >= region.start && pos <= region.end)
      ) {
        const cls =
          classifySite(
            trio,
            lineGenotypes(fields, columnOf),
            ruleFor(transmission, fields[0]),
          ) ?? 'unsettled'
        counts[cls]++
        if (classes.includes(cls)) {
          kept.push(line)
        }
      }
    }
  }
  return {
    text: `${[...header, ...kept].join('\n')}\n`,
    counts,
    kept: kept.length,
  }
}

const ALLELE_MAX = 12

const clipAllele = bases =>
  bases.length > ALLELE_MAX ? `${bases.slice(0, ALLELE_MAX)}…` : bases

const calledAlleles = gt => gt.split(/[/|]/).filter(a => a !== '.')

const haploidOrHomozygous = gt => {
  const alleles = gt.split(/[/|]/)
  return (
    alleles.length === 1 || alleles.every(a => a !== '.' && a === alleles[0])
  )
}

/**
 * Why a site is in its class, in words: the alleles no parent is called with
 * for a de novo candidate; for a Mendelian violation, the parent whose call the child's
 * shares no allele with, or that no gamete of each parent's call makes it. A
 * transmission entry naming one parent narrows the parents to that one, as
 * the classifier does.
 */
export function whyOf(cls, { members, genotypes, ref, alts, sex, rule }) {
  const name = index =>
    index === '0' ? clipAllele(ref) : clipAllele(alts[Number(index) - 1] ?? '?')
  const spell = gt => gt.replaceAll(/[^/|.]+/g, name)
  const [child, ...parents] = members
  const childGt = genotypes[child.sample] ?? '.'
  const parentAlleles = parents.flatMap(p =>
    calledAlleles(genotypes[p.sample] ?? '.'),
  )
  const novel = [
    ...new Set(calledAlleles(childGt).filter(a => !parentAlleles.includes(a))),
  ]
  const entry = rule.find(
    e => e.sex === undefined || (e.sex === sex && haploidOrHomozygous(childGt)),
  )
  const givers =
    entry && entry.from !== 'either'
      ? parents.filter(p => p.role === entry.from || p.role === 'parent')
      : parents
  const sharesNothing = givers.filter(p => {
    const gt = genotypes[p.sample] ?? '.'
    return (
      !gt.includes('.') &&
      !calledAlleles(gt).some(a => calledAlleles(childGt).includes(a))
    )
  })
  return {
    novel,
    why:
      cls === 'deNovoCandidate'
        ? `${parents.length === 1 ? `The ${parents[0].relationship} is not` : 'Neither parent is'} called with ${novel.map(name).join(' or ')}`
        : cls === 'mendelianViolation'
          ? sharesNothing.length
            ? sharesNothing
                .map(
                  p =>
                    `The ${child.relationship}'s call ${spell(childGt)} takes nothing from the ${p.relationship}'s ${spell(genotypes[p.sample])}`,
                )
                .join('; ')
            : `No gamete of each parent's call makes the ${child.relationship}'s ${spell(childGt)}`
          : '',
  }
}

const isBase = allele => /^[ACGTN]$/i.test(allele)

/**
 * The reads `jb2export` counted with the record's ALT, read as the reads of
 * the one allele no parent is called with, where that is the ALT, or the REF of a
 * site with one ALT. Only a substitution's count is read so: an indel's reads
 * often place it a few bases off the record's column, where the count at that
 * column misses them.
 */
export function novelCount(lane, novel, ref, alts) {
  const { alt, depth } = lane ?? {}
  const substitution = isBase(ref) && alts.every(isBase)
  return alt === undefined
    ? undefined
    : substitution && novel.length === 1 && novel[0] === '1'
      ? { bases: alts[0], reads: alt, depth, novel: true }
      : substitution &&
          novel.length === 1 &&
          novel[0] === '0' &&
          alts.length === 1
        ? { bases: ref, reads: depth - alt, depth, novel: true }
        : { bases: clipAllele(alts[0] ?? ''), reads: alt, depth, novel: false }
}

const readsOf = n => `${n} ${n === 1 ? 'read' : 'reads'}`

const counted = member =>
  member.count?.novel && member.count.depth !== undefined

/**
 * What the reads say against a de novo candidate's calls: each parent whose
 * reads carry the allele no parent is called with, and a child whose reads
 * all lack it
 */
export function readsSay([child, ...parents]) {
  return [
    ...parents
      .filter(p => counted(p) && p.count.reads > 0)
      .map(
        p =>
          `${p.count.reads} of the ${p.relationship}'s ${readsOf(p.count.depth)} ${p.count.reads === 1 ? 'has' : 'have'} it`,
      ),
    ...(counted(child) && child.count.reads === 0 && child.count.depth > 0
      ? [
          `the ${child.relationship}'s ${readsOf(child.count.depth)} ${child.count.depth === 1 ? 'lacks' : 'lack'} it`,
        ]
      : []),
  ]
}

export const TRIO_QUESTION = "What do the trio's reads show?"

/**
 * The verdicts a trio site takes, keyed 1 up in this order. A duo offers the
 * parent it has, and a selfed line its one parent.
 */
export function trioVerdicts(members) {
  return [
    {
      v: 'deNovo',
      label: 'Real de novo',
      tone: 'real',
      title: "The child's reads carry the allele and no parent's do",
    },
    ...members
      .filter(m => m.role !== 'child')
      .map(p => ({
        v: `missed:${p.role}`,
        label: `Missed in ${p.relationship}`,
        tone: 'artifact',
        title: `The ${p.relationship}'s reads carry the allele the call missed`,
      })),
    {
      v: 'childMiscall',
      label: 'Child miscall',
      tone: 'artifact',
      title: "The child's reads do not carry the call",
    },
    {
      v: 'copyNumber',
      label: 'Copy-number change',
      tone: 'accent',
      title:
        'The calls are right for a one-copy sample: a deletion, or uniparental disomy',
    },
    { v: 'unclear', label: 'Unclear', tone: 'unsure' },
  ].map((b, i) => ({ ...b, key: `${i + 1}` }))
}

/** The trio `--pedigree` and `--child` name among a VCF's samples, and its members */
export function readTrio({ pedigreeText, samples, child }) {
  const trio = pickTrio(
    triosOf(parsePedigree(pedigreeText, samples), samples),
    child,
  )
  return { trio, members: trioMembers(trio) }
}
