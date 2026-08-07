import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createReportBuilder } from '../../src/lib/report.js'

test('build() with no sections returns an empty report shell', () => {
  const report = createReportBuilder('hello-dolly').build()

  assert.deepEqual(report, {
    slug: 'hello-dolly',
    meta: {},
    summary: { pass: 0, warn: 0, fail: 0, info: 0 },
    sections: []
  })
})

test('meta() sets top-level metadata', () => {
  const report = createReportBuilder('hello-dolly')
    .meta({ stable_tag: '1.7.2' })
    .build()

  assert.deepEqual(report.meta, { stable_tag: '1.7.2' })
})

test('check() before any section() is a no-op', () => {
  const report = createReportBuilder('hello-dolly')
    .check('orphan check', 'pass', 'ignored')
    .build()

  assert.deepEqual(report.sections, [])
  assert.deepEqual(report.summary, { pass: 0, warn: 0, fail: 0, info: 0 })
})

test('single section rolls its check counts into the section and top-level summary', () => {
  const report = createReportBuilder('hello-dolly')
    .section('root', 'Main SVN Folder')
    .check('trunk/ exists', 'pass', 'Found')
    .check('tags/ exists', 'fail', 'Missing')
    .check('assets/ exists', 'warn', 'Optional')
    .build()

  assert.equal(report.sections.length, 1)

  const [section] = report.sections
  assert.equal(section.id, 'root')
  assert.equal(section.label, 'Main SVN Folder')
  assert.deepEqual(section.checks, [
    { label: 'trunk/ exists', status: 'pass', detail: 'Found' },
    { label: 'tags/ exists', status: 'fail', detail: 'Missing' },
    { label: 'assets/ exists', status: 'warn', detail: 'Optional' }
  ])
  assert.deepEqual(section.summary, { pass: 1, warn: 1, fail: 1, info: 0 })
  assert.deepEqual(report.summary, { pass: 1, warn: 1, fail: 1, info: 0 })
})

test('multiple sections and multiple checks per status sum correctly at the top level', () => {
  const report = createReportBuilder('hello-dolly')
    .section('root', 'Main SVN Folder')
    .check('trunk/ exists', 'pass')
    .check('tags/ exists', 'pass')
    .section('trunk', 'Trunk')
    .check('readme.txt found', 'fail')
    .check('Stable tag declared', 'fail')
    .check('Main plugin PHP file found', 'warn')
    .section('assets', 'Assets')
    .check('Banner image present', 'info')
    .check('Icon image present', 'info')
    .build()

  assert.equal(report.sections.length, 3)
  assert.deepEqual(report.sections.map((s) => s.summary), [
    { pass: 2, warn: 0, fail: 0, info: 0 },
    { pass: 0, warn: 1, fail: 2, info: 0 },
    { pass: 0, warn: 0, fail: 0, info: 2 }
  ])
  assert.deepEqual(report.summary, { pass: 2, warn: 1, fail: 2, info: 2 })
})

test('check() defaults detail to an empty string when omitted', () => {
  const report = createReportBuilder('hello-dolly')
    .section('root', 'Main SVN Folder')
    .check('trunk/ exists', 'pass')
    .build()

  assert.equal(report.sections[0].checks[0].detail, '')
})

test('starting a new section flushes the previous one in declaration order', () => {
  const report = createReportBuilder('hello-dolly')
    .section('a', 'Section A')
    .section('b', 'Section B')
    .check('only in b', 'pass')
    .build()

  assert.deepEqual(report.sections.map((s) => s.id), ['a', 'b'])
  assert.deepEqual(report.sections[0].checks, [])
  assert.equal(report.sections[1].checks.length, 1)
})
