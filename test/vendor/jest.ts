import assert from 'node:assert/strict'
import { describe, it as nodeIt } from 'node:test'

function each<T extends object>(rows: readonly T[]) {
  return (title: string, fn: (row: T) => void) => {
    for (const row of rows) {
      void nodeIt(
        title.replaceAll(/\$(\w+)/g, (_, key: string) =>
          String(Reflect.get(row, key)),
        ),
        () => {
          fn(row)
        },
      )
    }
  }
}

export const it = Object.assign(
  (title: string, fn: () => void) => {
    void nodeIt(title, fn)
  },
  { each },
)

export function expect(actual: unknown) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected)
    },
    toBeUndefined() {
      assert.equal(actual, undefined)
    },
  }
}

export { describe }
