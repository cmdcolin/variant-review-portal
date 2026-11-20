import fs from 'node:fs'
import zlib from 'node:zlib'

// bgzip is gzip: the magic bytes decide, not the extension
export function readVcfText(file) {
  const buf = fs.readFileSync(file)
  return (
    buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
  ).toString('utf8')
}
