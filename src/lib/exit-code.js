/**
 * Map a report to the tiered CI exit code: 4 unreachable, 3 not_found,
 * 2 has-fail, 1 has-warn, 0 all-pass.
 */
export function computeExitCode (report) {
  if (report.meta.error === 'unreachable') {
    return 4
  }

  if (report.meta.error === 'not_found') {
    return 3
  }

  if (report.summary.fail > 0) {
    return 2
  }

  if (report.summary.warn > 0) {
    return 1
  }

  return 0
}
