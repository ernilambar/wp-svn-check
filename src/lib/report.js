const STATUSES = ['pass', 'warn', 'fail', 'info']

function emptySummary () {
  return { pass: 0, warn: 0, fail: 0, info: 0 }
}

/**
 * Port of Report_Builder/Report/Section/Check_Item as plain objects. Fluent
 * builder for assembling a report section by section.
 */
export function createReportBuilder (slug) {
  const report = { slug, meta: {}, summary: emptySummary(), sections: [] }
  let currentSection = null

  function flushSection () {
    if (!currentSection) {
      return
    }

    report.sections.push(currentSection)

    for (const status of STATUSES) {
      report.summary[status] += currentSection.summary[status]
    }

    currentSection = null
  }

  const builder = {
    meta (meta) {
      report.meta = meta
      return builder
    },

    section (id, label) {
      flushSection()
      currentSection = { id, label, summary: emptySummary(), checks: [] }
      return builder
    },

    check (label, status, detail = '') {
      if (currentSection) {
        currentSection.checks.push({ label, status, detail })
        currentSection.summary[status] += 1
      }

      return builder
    },

    build () {
      flushSection()
      return report
    }
  }

  return builder
}
