# Reviewing a trio

A trio VCF and a pedigree give a queue of the sites where the child's genotype
cannot be made of one gamete from each parent. JBrowse's Mendelian check flags
those sites; checking one means the child's and both parents' reads at it. The
portal draws the three in one picture a site, so the queue can be finished.

```bash
# the sites the Mendelian check flags, de novo candidates and Mendelian
# violations, as a VCF jb2export can render
variant-review-trio-sites --vcf trio.vcf.gz --pedigree family.ped \
  --region chr1:190000000-200000000 --out sites.vcf

# the child's reads first, then the parents', in one image a site
jb2export batch --sites sites.vcf --config config.json --assembly hg38 \
  --track trio_calls height:60 --track child_reads height:180 \
  --track father_reads height:180 --track mother_reads height:180 \
  --flank 75 --outDir reads --manifest

# name each alignments track by its sample, in track order
variant-review-portal --vcf sites.vcf --pedigree family.ped \
  --images HG02024,HG02026,HG02025=reads --out portal
```

## Input

- **`--pedigree`** is the file JBrowse's `pedigreeLocation` reads: a PLINK
  `.fam` or `.ped` with no header (FID, IID, PAT, MAT, SEX, PHENO), or a table
  whose header names `SampleID` or `IID`, `FatherID` or `PAT`, `MotherID` or
  `MAT` and `Sex`, as 1000 Genomes'
  `20130606_g1k_3202_samples_ped_population.txt` does. The columns are found
  from the first row, never the extension. A parent of `0` is unknown, and sex
  `1` is male, `2` female, `0` or `-9` missing and anything else `other`.
- **The trio** is the child among the VCF's samples whose father or mother is
  among them too. A VCF holding more than one takes `--child` to pick it. A
  child with one parent in the VCF is a duo, and one whose father and mother are
  the same sample is a selfed line.
- **`--transmission`** is a JSON list in the shape of the assembly's
  `transmission` slot, `{ "refName", "sex", "from" }`, for the contigs a child
  does not inherit one copy from each parent: sex chromosomes, organelles,
  haplodiploid males. `refName` matches the VCF's `CHROM` exactly. Left out,
  every contig takes the autosomal rule, which reads a hemizygous male X call
  as a violation.
- **The alignments tracks** are one `jb2export batch` run, the child's track
  first. `--images` names each by its VCF sample, so the portal knows whose
  reads each count is. A track left out (a parent with no reads) leaves that
  member's read column empty.

## The classifier

Both commands run JBrowse's `classifyTrio` (ADR-279 in jbrowse-components), the
one rule the variant track colors by: any ploidy, read from the genotype; a duo
the known parent cannot settle is no call; `either`, polyploid and aneuploid
splits never report a violation. Phase is ignored.

`@jbrowse/plugin-variants` 5.0.0-beta.22, the latest published, predates the
check and exports no subpath for it, so `lib/vendor/classifyTrio.ts` is a copy,
byte for byte, with its truth-table tests in `test/vendor/`. It goes when a
published package exports the file (see [DEVELOPMENT.md](../DEVELOPMENT.md)).

## The queue

`variant-review-trio-sites` writes the records whose class is in `--classes`,
`deNovoCandidate,mendelianViolation` by default, in the VCF's order and with
its header, so the file is still a VCF for `jb2export` and the portal. Add
`consistent` for a sample of the sites that pass. The portal orders the cards
de novo candidates first, then Mendelian violations, each in position order.

## A card

- **One image**: the calls track, then the child's, father's and mother's reads
  at the site, each track named by its config, which writes sample and
  relationship (`HG02024 (daughter)`).
- **The trio's calls**: each member's sample, relationship, `GT` and whatever
  else its `FORMAT` holds (`DP`, `AD`, `GQ`), beside the reads `jb2export`
  counted with the record's ALT over the reads covering it.
- **The class and why**: the allele in neither parent for a de novo candidate
  (`G is in neither parent`), or the parent the child shares no allele with for
  a Mendelian violation (`nothing from the father's T/T`).
- **The verdicts that fit a trio**, keyed in order: real de novo, missed in the
  father, missed in the mother, child miscall, copy-number change (a deletion or
  uniparental disomy, where the calls are right for a one-copy sample), unclear.
  A duo offers the parent it has; a selfed line offers one parent.

## The reads say

Where the count is of the allele in neither parent (an ALT, or the REF of a
biallelic site, counted as the reads without the ALT), the support filter sorts
the de novo candidates three ways:

- **no read in the child has it**: a child miscall, most likely;
- **a parent's reads have it too**: a parental allele the calls missed;
- **only the child's reads have it**: the candidates left standing.

A Mendelian violation has no allele in neither parent and stays uncounted. The
picture decides a card; the grouping orders the queue.

## The table and the TSV

The table is sectioned by class, with each member's `GT` and read count in a
column named by its sample. Export adds `trio_class` and `genotypes`
(`HG02024=0|1;HG02026=0|0;HG02025=0|0`) to the TSV, and Import reads the trio
verdicts back.
