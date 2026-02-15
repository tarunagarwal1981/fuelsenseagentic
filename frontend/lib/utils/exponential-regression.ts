/**
 * Exponential regression: y = a * exp(b * x)
 * Linearized as ln(y) = ln(a) + b*x; fit (x, ln(y)) then a = exp(intercept).
 * Requires all y > 0. R² computed in original space.
 */

export interface DataPoint {
  x: number;
  y: number;
}

export interface ExponentialRegressionResult {
  /** y = a * exp(b * x) */
  a: number;
  b: number;
  r_squared: number;
  equation_text: string;
}

const EPSILON = 1e-12;
const MIN_POSITIVE_Y = 1e-10;

/**
 * Calculate exponential regression y = a * exp(b*x) using linear regression on (x, ln(y)).
 * Points with y <= 0 are excluded. Requires at least 2 valid points.
 */
export function calculateExponentialRegression(
  points: DataPoint[]
): ExponentialRegressionResult | null {
  const valid = (points ?? []).filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.y > MIN_POSITIVE_Y
  );
  if (valid.length < 2) return null;

  const n = valid.length;
  let sumX = 0,
    sumLogY = 0,
    sumX2 = 0,
    sumXLogY = 0;
  for (const p of valid) {
    const logY = Math.log(p.y);
    sumX += p.x;
    sumLogY += logY;
    sumX2 += p.x * p.x;
    sumXLogY += p.x * logY;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < EPSILON) return null;

  const slope = (n * sumXLogY - sumX * sumLogY) / denom;
  const intercept = (sumLogY - slope * sumX) / n;
  const a = Math.exp(intercept);
  const b = slope;

  const yMean = valid.reduce((s, p) => s + p.y, 0) / n;
  let ssTotal = 0;
  let ssResidual = 0;
  for (const p of valid) {
    const fitted = a * Math.exp(b * p.x);
    ssTotal += (p.y - yMean) ** 2;
    ssResidual += (p.y - fitted) ** 2;
  }
  const r_squared =
    ssTotal > EPSILON ? Math.max(0, 1 - ssResidual / ssTotal) : 0;

  const equation_text = `y = ${roundForDisplay(a)} × e^(${roundForDisplay(b)}x)`;

  return { a, b, r_squared, equation_text };
}

function roundForDisplay(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Generate points along the curve y = a * exp(b * x).
 */
export function generateExponentialCurve(
  a: number,
  b: number,
  minX: number,
  maxX: number,
  numPoints: number = 50
): DataPoint[] {
  const points: DataPoint[] = [];
  const step = numPoints <= 1 ? 0 : (maxX - minX) / (numPoints - 1);
  for (let i = 0; i < numPoints; i++) {
    const x = minX + i * step;
    const y = a * Math.exp(b * x);
    points.push({ x, y });
  }
  return points;
}
