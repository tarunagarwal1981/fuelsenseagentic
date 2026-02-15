/**
 * 2nd order polynomial regression utilities.
 * Least squares fit: y = ax² + bx + c
 * R² = 1 - (SSresidual / SStotal)
 */

/** A single (x, y) data point */
export interface DataPoint {
  x: number;
  y: number;
}

/** Result of quadratic least squares regression */
export interface PolynomialRegressionResult {
  /** Coefficients [a, b, c] for y = ax² + bx + c */
  coefficients: [number, number, number];
  /** Coefficient of determination (0–1, higher = better fit) */
  r_squared: number;
  /** Human-readable equation string */
  equation_text: string;
}

/** Polynomial fit shape for use by chart services and consumers (same as PolynomialRegressionResult) */
export interface PolynomialFit {
  coefficients: [number, number, number];
  r_squared: number;
  equation_text: string;
}

/** Epsilon for singular matrix detection */
const EPSILON = 1e-10;

/**
 * Compute determinant of 3×3 matrix (row-major).
 * Used to solve normal equations; near-zero => singular.
 */
function det3(
  a00: number,
  a01: number,
  a02: number,
  a10: number,
  a11: number,
  a12: number,
  a20: number,
  a21: number,
  a22: number
): number {
  return (
    a00 * (a11 * a22 - a12 * a21) -
    a01 * (a10 * a22 - a12 * a20) +
    a02 * (a10 * a21 - a11 * a20)
  );
}

/**
 * Calculate 2nd order polynomial regression using least squares.
 * Solves normal equations (X'X)β = X'y for β = [a, b, c] with design rows [x², x, 1].
 *
 * @param points - Array of {x, y} points
 * @returns { coefficients, r_squared, equation_text } or null if fewer than 3 points or singular matrix
 */
export function calculatePolynomialRegression(
  points: DataPoint[]
): PolynomialRegressionResult | null {
  if (!points || points.length < 3) {
    return null;
  }

  const n = points.length;
  let sumX = 0,
    sumY = 0,
    sumX2 = 0,
    sumX3 = 0,
    sumX4 = 0,
    sumXY = 0,
    sumX2Y = 0;

  for (const p of points) {
    const x = p.x;
    const y = p.y;
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x2 * x2;
    sumX += x;
    sumY += y;
    sumX2 += x2;
    sumX3 += x3;
    sumX4 += x4;
    sumXY += x * y;
    sumX2Y += x2 * y;
  }

  // Normal equations matrix (symmetric):
  // [ Σx⁴   Σx³   Σx² ] [a]   [Σx²y]
  // [ Σx³   Σx²   Σx  ] [b] = [Σxy ]
  // [ Σx²   Σx    n   ] [c]   [Σy  ]
  const det = det3(sumX4, sumX3, sumX2, sumX3, sumX2, sumX, sumX2, sumX, n);

  if (Math.abs(det) < EPSILON) {
    return null;
  }

  // Cramer's rule: a = det_a / det, b = det_b / det, c = det_c / det
  const detA = det3(sumX2Y, sumX3, sumX2, sumXY, sumX2, sumX, sumY, sumX, n);
  const detB = det3(sumX4, sumX2Y, sumX2, sumX3, sumXY, sumX, sumX2, sumY, n);
  const detC = det3(sumX4, sumX3, sumX2Y, sumX3, sumX2, sumXY, sumX2, sumX, sumY);

  const a = detA / det;
  const b = detB / det;
  const c = detC / det;

  const coefficients: [number, number, number] = [a, b, c];

  // R² = 1 - (SSresidual / SStotal)
  const yMean = sumY / n;
  let ssTotal = 0;
  let ssResidual = 0;
  for (const p of points) {
    const diff = p.y - yMean;
    ssTotal += diff * diff;
    const fitted = a * p.x * p.x + b * p.x + c;
    const resid = p.y - fitted;
    ssResidual += resid * resid;
  }
  const r_squared =
    ssTotal > EPSILON ? Math.max(0, 1 - ssResidual / ssTotal) : 0;

  const equation_text = formatEquation(a, b, c);

  return {
    coefficients,
    r_squared,
    equation_text,
  };
}

function formatEquation(a: number, b: number, c: number): string {
  const parts: string[] = [];
  const fmt = (v: number) => (v >= 0 ? `+ ${v}` : `- ${Math.abs(v)}`);
  parts.push(`y = ${roundForDisplay(a)}x² ${fmt(roundForDisplay(b))}x ${fmt(roundForDisplay(c))}`);
  return parts.join(' ').replace(/\s*\+\s*-\s*/g, ' - ');
}

function roundForDisplay(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Generate evenly spaced points along a quadratic curve.
 *
 * @param coefficients - [a, b, c] for y = ax² + bx + c
 * @param minX - Lower bound of x
 * @param maxX - Upper bound of x
 * @param numPoints - Number of points (default 50) for smooth visualization
 * @returns Array of {x, y} points along the curve
 */
export function generatePolynomialCurve(
  coefficients: [number, number, number],
  minX: number,
  maxX: number,
  numPoints: number = 50
): DataPoint[] {
  const [a, b, c] = coefficients;
  const points: DataPoint[] = [];
  const step =
    numPoints <= 1 ? 0 : (maxX - minX) / (numPoints - 1);

  for (let i = 0; i < numPoints; i++) {
    const x = minX + i * step;
    const y = a * x * x + b * x + c;
    points.push({ x, y });
  }

  return points;
}
