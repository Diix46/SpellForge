import { cpus, loadavg } from 'node:os'
import process from 'node:process'
import { it } from 'vitest'

/**
 * Timing checks, and when to trust them.
 *
 * A few tests guard against real, measured regressions: a query that went from
 * milliseconds to minutes, a resolve that once needed five network calls per
 * card. Their bounds are tight on purpose — loose ones would hide exactly what
 * they watch for. But a stopwatch only means something on a machine that is
 * not fighting for its cores: a parallel build or another agent's test run
 * makes the same query take five times longer, which says nothing about the
 * code.
 *
 * So these tests keep their tight bounds and simply stand down when the
 * machine is busy, instead of failing the suite for someone else's load.
 * `PERF=1` runs them anyway, to measure on purpose.
 */
const BUSY = process.env.PERF !== '1' && loadavg()[0]! > Math.max(2, cpus().length * 0.7)

/** `it`, but skipped while the machine is under load. */
export const itPerf = it.skipIf(BUSY)
