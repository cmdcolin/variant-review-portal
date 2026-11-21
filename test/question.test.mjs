import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readQuestion } from '../lib/review.mjs'

const asked = answers => () =>
  readQuestion(JSON.stringify({ question: 'Supported?', answers }))

test('an answer is valued by its label and keyed by its place unless given', () => {
  assert.deepEqual(
    readQuestion(
      JSON.stringify({
        question: ' Does the sample support the call? ',
        answers: [
          { label: 'Supports', tone: 'real' },
          { label: 'Does not support', value: 'no', key: 'd', title: 'No' },
        ],
      }),
    ),
    {
      question: 'Does the sample support the call?',
      choices: [
        {
          v: 'Supports',
          label: 'Supports',
          key: '1',
          tone: 'real',
          title: undefined,
        },
        {
          v: 'no',
          label: 'Does not support',
          key: 'd',
          tone: undefined,
          title: 'No',
        },
      ],
    },
  )
})

test('a question names its text and at least one answer', () => {
  assert.throws(
    () => readQuestion(JSON.stringify({ answers: [{ label: 'a' }] })),
    /needs a "question"/,
  )
  assert.throws(asked([]), /needs "answers"/)
  assert.throws(asked([{ key: 'a' }]), /answer 1 has no "label"/)
})

test('an answer keeps off the keys the page binds and the ones taken', () => {
  assert.throws(
    asked([{ label: 'Supports', key: 'n' }]),
    /keyed n, which the page binds to note/,
  )
  assert.throws(asked([{ label: 'Gone', key: '0' }]), /clear the answer/)
  assert.throws(
    asked([
      { label: 'A', key: 'a' },
      { label: 'B', key: 'a' },
    ]),
    /share the key "a"/,
  )
  assert.throws(
    asked([{ label: 'A' }, { label: 'B', value: 'A' }]),
    /share the value "A"/,
  )
  assert.throws(asked([{ label: 'A', key: 'ab' }]), /a "key" of one character/)
  assert.throws(
    asked(Array.from({ length: 10 }, (_, i) => ({ label: `${i}` }))),
    /"9" needs a "key"/,
  )
})

test('an answer is no tone the page does not draw, and never unreviewed', () => {
  assert.throws(asked([{ label: 'A', tone: 'red' }]), /tone "red"/)
  assert.throws(asked([{ label: 'unreviewed' }]), /no answer/)
})
