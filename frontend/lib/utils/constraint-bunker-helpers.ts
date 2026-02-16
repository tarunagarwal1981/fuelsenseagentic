/**
 * Constraint validation and ranking for constraint-first bunker workflow.
 */

import type {
  BunkerConstraints,
  ConstraintValidationResult,
  ConstraintType,
  RelaxedConstraints,
} from '@/lib/types/bunker';

/** Port option with pricing (and optional capabilities) for validation. */
export interface PortWithPricing {
  port: string;
  portCode?: string;
  fuelType: string;
  pricePerMT: number;
  availableQuantityMT?: number;
  maxSupplyRateMTPerHour?: number;
  distanceFromRouteNm?: number;
}

/**
 * Validate port can supply required quantity.
 */
export function validateQuantity(
  port: PortWithPricing,
  constraints: BunkerConstraints
): ConstraintValidationResult {
  const failures: ConstraintType[] = [];
  const reasons: string[] = [];
  const maxQ = constraints.maxQuantityMT;
  const minQ = constraints.minQuantityMT;
  if (maxQ != null && (port.availableQuantityMT ?? 0) > 0 && port.availableQuantityMT! < maxQ) {
    failures.push('quantity_max');
    reasons.push(`Port cannot supply ${maxQ} MT (available ${port.availableQuantityMT} MT)`);
  }
  if (minQ != null && (port.availableQuantityMT ?? 0) > 0 && port.availableQuantityMT! < minQ) {
    failures.push('quantity_min');
    reasons.push(`Port cannot supply ${minQ} MT (available ${port.availableQuantityMT} MT)`);
  }
  return { valid: failures.length === 0, failures, reasons };
}

/**
 * Validate price is within ceiling.
 */
export function validatePrice(
  port: PortWithPricing,
  constraints: BunkerConstraints
): ConstraintValidationResult {
  const ceiling = constraints.priceCeilingPerMT;
  if (ceiling == null) return { valid: true, failures: [], reasons: [] };
  const valid = port.pricePerMT <= ceiling;
  return {
    valid,
    failures: valid ? [] : ['price_ceiling'],
    reasons: valid ? [] : [`Price $${port.pricePerMT}/MT exceeds ceiling $${ceiling}/MT`],
  };
}

/**
 * Validate fuel type is available.
 */
export function validateFuelType(
  port: PortWithPricing,
  constraints: BunkerConstraints
): ConstraintValidationResult {
  const required = constraints.fuelTypes.length ? constraints.fuelTypes : ['VLSFO'];
  const portFuel = port.fuelType.toUpperCase();
  const match = required.some((f) => portFuel.includes(f.toUpperCase()) || f.toUpperCase().includes(portFuel));
  return {
    valid: match,
    failures: match ? [] : ['fuel_type'],
    reasons: match ? [] : [`Port has ${port.fuelType}, required one of ${required.join(', ')}`],
  };
}

/**
 * Validate port capabilities (supply rate, etc.). Optional; no hard fail if missing.
 */
export function validateCapabilities(
  port: PortWithPricing,
  _constraints: BunkerConstraints
): ConstraintValidationResult {
  if (port.maxSupplyRateMTPerHour != null && port.maxSupplyRateMTPerHour <= 0) {
    return { valid: false, failures: [], reasons: ['Port has no supply rate'] };
  }
  return { valid: true, failures: [], reasons: [] };
}

/**
 * Validate time window (can reach port in time). Placeholder when route not provided.
 */
export function validateTimeWindow(
  _port: PortWithPricing,
  constraints: BunkerConstraints,
  _route?: { estimated_hours?: number }
): ConstraintValidationResult {
  if (constraints.timeWindowDays == null && !constraints.requiredByDate) {
    return { valid: true, failures: [], reasons: [] };
  }
  return { valid: true, failures: [], reasons: [] };
}

/**
 * Run all validators; return combined result.
 */
export function validatePortAgainstConstraints(
  port: PortWithPricing,
  constraints: BunkerConstraints,
  route?: { estimated_hours?: number }
): ConstraintValidationResult {
  const results = [
    validateQuantity(port, constraints),
    validatePrice(port, constraints),
    validateFuelType(port, constraints),
    validateCapabilities(port, constraints),
    validateTimeWindow(port, constraints, route),
  ];
  const failures: ConstraintType[] = [];
  const reasons: string[] = [];
  for (const r of results) {
    if (!r.valid) {
      failures.push(...r.failures);
      reasons.push(...r.reasons);
    }
  }
  return { valid: failures.length === 0, failures: [...new Set(failures)], reasons };
}

/** Score deductions for constraint matching. */
const DEDUCT_NEAR_CEILING = 10;
const DEDUCT_OVER_QUANTITY = 5;
const DEDUCT_SLOW_SUPPLY = 5;
const DEDUCT_NOT_PREFERRED = 15;

/**
 * Score a port 0–100 based on how well it meets constraints.
 * Perfect match = 100; deduct for near ceiling, over quantity, slow supply, not preferred.
 */
export function scoreConstraintMatch(
  port: PortWithPricing,
  constraints: BunkerConstraints
): number {
  let score = 100;
  const ceiling = constraints.priceCeilingPerMT;
  if (ceiling != null && port.pricePerMT >= ceiling * 0.95 && port.pricePerMT <= ceiling * 1.05) {
    score -= DEDUCT_NEAR_CEILING;
  }
  const maxQ = constraints.maxQuantityMT;
  if (maxQ != null && (port.availableQuantityMT ?? 0) > 0 && port.availableQuantityMT! > maxQ * 1.1) {
    score -= DEDUCT_OVER_QUANTITY;
  }
  if (port.maxSupplyRateMTPerHour != null && port.maxSupplyRateMTPerHour < 100) {
    score -= DEDUCT_SLOW_SUPPLY;
  }
  const preferred = constraints.preferredPorts.map((p) => p.toLowerCase());
  const portName = (port.port || port.portCode || '').toLowerCase();
  const isPreferred = preferred.some((p) => portName.includes(p) || p.includes(portName));
  if (preferred.length > 0 && !isPreferred) {
    score -= DEDUCT_NOT_PREFERRED;
  }
  return Math.max(0, Math.min(100, score));
}

/**
 * Rank ports by constraint match score (descending).
 */
export function rankByConstraintMatch(
  ports: PortWithPricing[],
  constraints: BunkerConstraints
): PortWithPricing[] {
  return [...ports].sort((a, b) => scoreConstraintMatch(b, constraints) - scoreConstraintMatch(a, constraints));
}

/**
 * Relax constraints iteratively: quantity +10%, price +5%, time +1 day.
 * Returns new constraints and what was relaxed.
 */
export function relaxConstraintsOnce(
  constraints: BunkerConstraints
): { relaxed: BunkerConstraints; relaxedRecord: RelaxedConstraints } {
  const relaxedRecord: RelaxedConstraints = {};
  const relaxed: BunkerConstraints = {
    ...constraints,
    fuelTypes: [...constraints.fuelTypes],
    preferredPorts: [...constraints.preferredPorts],
    avoidPorts: [...constraints.avoidPorts],
  };
  if (constraints.maxQuantityMT != null) {
    const newVal = Math.ceil(constraints.maxQuantityMT * 1.1);
    relaxed.maxQuantityMT = newVal;
    relaxedRecord.quantity_relaxed = {
      original: constraints.maxQuantityMT,
      relaxed: newVal,
      reason: 'Max quantity relaxed by 10% to find options.',
    };
  }
  if (constraints.priceCeilingPerMT != null) {
    const newVal = Math.ceil(constraints.priceCeilingPerMT * 1.05);
    relaxed.priceCeilingPerMT = newVal;
    relaxedRecord.price_relaxed = {
      original: constraints.priceCeilingPerMT,
      relaxed: newVal,
      reason: 'Price ceiling relaxed by 5% to find options.',
    };
  }
  if (constraints.timeWindowDays != null) {
    const newVal = constraints.timeWindowDays + 1;
    relaxed.timeWindowDays = newVal;
    relaxedRecord.time_relaxed = {
      original: constraints.timeWindowDays,
      relaxed: newVal,
      reason: 'Time window relaxed by 1 day to find options.',
    };
  }
  return { relaxed, relaxedRecord };
}
