/**
 * Burn-rate forecasting: "at this pace, the weekly cap is reached around Thursday 4pm".
 *
 * A forecast is a guess with error bars, and this module refuses to pretend otherwise.
 * Every result carries an explicit range and a confidence level, and the module
 * returns `null` — rather than a plausible-looking number — whenever the data cannot
 * support a projection. The UI renders the range, never the midpoint alone.
 */

import type { Snapshot } from './history.ts';

export type ForecastConfidence = 'low' | 'medium' | 'high';

export interface Forecast {
  /** Percentage points consumed per hour. */
  readonly ratePerHour: number;
  /** Timestamp when 100% is projected to be reached. */
  readonly exhaustionAt: number;
  /** Earliest and latest plausible exhaustion, from the slope's standard error. */
  readonly earliestAt: number;
  readonly latestAt: number;
  readonly confidence: ForecastConfidence;
  /** Coefficient of determination, 0..1. Exposed so the UI can be honest. */
  readonly fit: number;
  readonly samples: number;
}

/** Below this many points a trend line is noise with a slope. */
const MIN_SAMPLES = 4;
/** Below this timespan the slope is dominated by measurement jitter. */
const MIN_SPAN_MS = 15 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

interface Fit {
  slope: number;
  intercept: number;
  r2: number;
  slopeStdError: number;
}

/** Ordinary least squares of percent against time, in hours. */
function leastSquares(points: readonly Snapshot[]): Fit | null {
  const n = points.length;
  const t0 = points[0]?.at ?? 0;
  const xs = points.map((p) => (p.at - t0) / HOUR_MS);
  const ys = points.map((p) => p.percent);

  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    sxx += dx * dx;
    sxy += dx * ((ys[i] ?? 0) - meanY);
  }
  if (sxx === 0) return null; // All samples at the same instant.

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const predicted = slope * (xs[i] ?? 0) + intercept;
    ssRes += ((ys[i] ?? 0) - predicted) ** 2;
    ssTot += ((ys[i] ?? 0) - meanY) ** 2;
  }

  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  // Standard error of the slope; n-2 degrees of freedom.
  const slopeStdError = n > 2 ? Math.sqrt(ssRes / (n - 2) / sxx) : Number.POSITIVE_INFINITY;

  return { slope, intercept, r2, slopeStdError };
}

function confidenceFrom(r2: number, samples: number): ForecastConfidence {
  if (samples >= 12 && r2 >= 0.85) return 'high';
  if (samples >= 6 && r2 >= 0.5) return 'medium';
  return 'low';
}

/**
 * Projects when `series` reaches `ceilingPercent`.
 *
 * Returns null — meaning "we don't know", which the UI renders as no forecast at all —
 * when there are too few samples, too short a timespan, or a flat/falling trend.
 * Usage that is not rising has no exhaustion time, and inventing one would be exactly
 * the kind of confident-looking fiction this project exists to avoid.
 */
export function forecastExhaustion(
  series: readonly Snapshot[],
  now: number,
  ceilingPercent = 100,
): Forecast | null {
  const points = [...series].sort((a, b) => a.at - b.at);
  if (points.length < MIN_SAMPLES) return null;

  const span = (points[points.length - 1]?.at ?? 0) - (points[0]?.at ?? 0);
  if (span < MIN_SPAN_MS) return null;

  const fit = leastSquares(points);
  if (fit === null || fit.slope <= 0) return null;

  const current = points[points.length - 1]?.percent ?? 0;
  const remaining = ceilingPercent - current;
  if (remaining <= 0) return null; // Already there; nothing to forecast.

  const hoursToExhaustion = remaining / fit.slope;
  const exhaustionAt = now + hoursToExhaustion * HOUR_MS;

  // Error bars from the slope's standard error, clamped so a noisy fit cannot
  // produce a negative or absurd bound.
  const fastSlope = fit.slope + fit.slopeStdError;
  const slowSlope = Math.max(fit.slope - fit.slopeStdError, fit.slope * 0.25);
  const earliestAt = now + (remaining / fastSlope) * HOUR_MS;
  const latestAt = now + (remaining / slowSlope) * HOUR_MS;

  return {
    ratePerHour: fit.slope,
    exhaustionAt,
    earliestAt: Math.min(earliestAt, exhaustionAt),
    latestAt: Math.max(latestAt, exhaustionAt),
    confidence: confidenceFrom(fit.r2, points.length),
    fit: fit.r2,
    samples: points.length,
  };
}

/**
 * Phrases a forecast as a range with its confidence attached. Deliberately hedged —
 * "around", "between" — because it is a projection, not a fact.
 */
export function describeForecast(forecast: Forecast, format: (at: number) => string): string {
  if (forecast.confidence === 'low') {
    return `Roughly ${format(forecast.exhaustionAt)}, but the trend is too noisy to rely on`;
  }
  return `Around ${format(forecast.exhaustionAt)} (between ${format(forecast.earliestAt)} and ${format(forecast.latestAt)})`;
}
