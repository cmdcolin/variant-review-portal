// What slicing a callset's reads decides without running a tool: which windows,
// which files, and the config that reads the slices. Pure, so the tests hand it
// strings and objects.

/**
 * The windows `jb2export batch --dryRun` prints, a file and its loci a line, as
 * a sorted BED with overlapping windows merged.
 */
export function windowsBed(dryRun) {
  const windows = dryRun
    .split('\n')
    .flatMap(line => line.split('\t').slice(1))
    .filter(Boolean)
    .map(loc => {
      const at = loc.lastIndexOf(':')
      const [start, end] = loc.slice(at + 1).split('-').map(Number)
      return { refName: loc.slice(0, at), start: start - 1, end }
    })
    .sort((a, b) =>
      a.refName === b.refName
        ? a.start - b.start
        : a.refName < b.refName
          ? -1
          : 1,
    )
  const merged = []
  for (const w of windows) {
    const last = merged.at(-1)
    if (last?.refName === w.refName && w.start <= last.end) {
      last.end = Math.max(last.end, w.end)
    } else {
      merged.push({ ...w })
    }
  }
  return merged.map(w => `${w.refName}\t${w.start}\t${w.end}\n`).join('')
}

/**
 * A config with every relative `uri` resolved against where the config was
 * read from, so a copy of it written somewhere else still finds its files.
 */
export function absolutize(config, base) {
  const walk = node =>
    Array.isArray(node)
      ? node.map(walk)
      : node && typeof node === 'object'
        ? Object.fromEntries(
            Object.entries(node).map(([key, value]) => [
              key,
              key === 'uri' && typeof value === 'string'
                ? new URL(value, base).href
                : walk(value),
            ]),
          )
        : node
  return walk(config)
}

const READ_ADAPTERS = {
  BamAdapter: 'bamLocation',
  CramAdapter: 'cramLocation',
}

/** Where each named alignments track reads from */
export function readSources(config, trackIds) {
  return trackIds.map(trackId => {
    const track = (config.tracks ?? []).find(t => t.trackId === trackId)
    if (!track) {
      throw new Error(`the config has no track "${trackId}"`)
    }
    const { adapter = {} } = track
    const location = READ_ADAPTERS[adapter.type]
    const url = adapter.uri ?? adapter[location]?.uri
    if (!location || !url) {
      throw new Error(
        `track "${trackId}" is not a BAM or CRAM read by URL or path, so there is nothing to slice`,
      )
    }
    return { trackId, url, assemblyName: track.assemblyNames?.[0] }
  })
}

/**
 * The FASTA an assembly reads, which samtools needs to write CRAM. Undefined
 * for a sequence samtools cannot open, such as a 2bit.
 */
export function referenceFasta(config, assemblyName) {
  const assemblies = config.assemblies ?? (config.assembly ? [config.assembly] : [])
  const adapter = assemblies.find(a => a.name === assemblyName)?.sequence
    ?.adapter
  return ['BgzipFastaAdapter', 'IndexedFastaAdapter'].includes(adapter?.type)
    ? (adapter.uri ?? adapter.fastaLocation?.uri)
    : undefined
}

export function sliceFile(trackId, format) {
  return `reads/${trackId.replaceAll(/[^\w.-]+/g, '-')}.${format}`
}

/**
 * The config a portal hosts: each named track reads its slice, a path beside
 * the config, and everything else stays where it was.
 */
export function sliceConfig(config, trackIds, format) {
  const location = uri => ({ uri, locationType: 'UriLocation' })
  return {
    ...config,
    tracks: config.tracks.map(track => {
      if (!trackIds.includes(track.trackId)) {
        return track
      }
      const file = sliceFile(track.trackId, format)
      return {
        ...track,
        adapter:
          format === 'cram'
            ? {
                type: 'CramAdapter',
                cramLocation: location(file),
                craiLocation: location(`${file}.crai`),
              }
            : {
                type: 'BamAdapter',
                bamLocation: location(file),
                index: { location: location(`${file}.bai`) },
              },
      }
    }),
  }
}
