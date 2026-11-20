import assert from 'node:assert/strict'
import { describe, it as nodeIt } from 'node:test'
function each(rows) {
  return (title, fn) => {
    for (const row of rows) {
      void nodeIt(
        title.replaceAll(/\$(\w+)/g, (_, key) => String(Reflect.get(row, key))),
        () => {
          fn(row)
        },
      )
    }
  }
}
const it = Object.assign(
  (title, fn) => {
    void nodeIt(title, fn)
  },
  { each },
)
function expect(actual) {
  return {
    toBe(expected) {
      assert.equal(actual, expected)
    },
    toBeUndefined() {
      assert.equal(actual, undefined)
    },
  }
}
export { describe, expect, it }
