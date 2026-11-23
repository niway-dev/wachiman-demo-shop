/**
 * Money is an integer count of minor units (cents). 1999 means 19.99.
 * Floating point numbers never represent an amount in the domain: every
 * function here accepts and returns whole minor units.
 */
declare const moneyBrand: unique symbol

export type Money = number & { readonly [moneyBrand]: "Money" }

/**
 * Rule: an amount is a safe integer. Anything else (a fraction, NaN,
 * Infinity, or a number beyond Number.MAX_SAFE_INTEGER) throws a RangeError
 * so a bad amount fails where it is created, not where it is charged.
 */
export function money(minorUnits: number): Money {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError(`Money must be a safe integer of minor units, got ${minorUnits}`)
  }
  return minorUnits as Money
}

/** The zero amount. */
export const ZERO: Money = money(0)

/**
 * Rule: the sum of two amounts, exact. The result stays an integer, so no
 * rounding happens. Throws a RangeError if the sum leaves the safe range.
 */
export function add(a: Money, b: Money): Money {
  return money(a + b)
}

/**
 * Rule: the difference `a - b`, exact. The result may be negative; flooring a
 * total at zero is a separate rule and is not applied here.
 */
export function subtract(a: Money, b: Money): Money {
  return money(a - b)
}

/**
 * Rule: scale an amount by a factor (a quantity or a rate such as 0.9) and
 * round the product to a whole minor unit, half away from zero: 100.5 becomes
 * 101 and -100.5 becomes -101. The product is exact for integer factors. For a
 * fractional factor it is computed in floating point first, so rates must be
 * written with few decimals (0.9, 0.125). Throws a RangeError if the factor is
 * not finite.
 */
export function multiply(amount: Money, factor: number): Money {
  if (!Number.isFinite(factor)) {
    throw new RangeError(`Factor must be a finite number, got ${factor}`)
  }
  const product = amount * factor
  const rounded = Math.sign(product) * Math.round(Math.abs(product))
  // Math.sign(0) is 0 and Math.sign(-0) is -0: normalise a negative zero.
  return money(rounded === 0 ? 0 : rounded)
}

/**
 * Rule: render an amount as a decimal string with exactly two fraction
 * digits, using integer arithmetic only: 1999 becomes "19.99", 5 becomes
 * "0.05", -250 becomes "-2.50". It does not add a currency symbol.
 */
export function formatMoney(amount: Money): string {
  const sign = amount < 0 ? "-" : ""
  const abs = Math.abs(amount)
  const units = Math.floor(abs / 100)
  const cents = abs % 100
  return `${sign}${units}.${cents.toString().padStart(2, "0")}`
}
