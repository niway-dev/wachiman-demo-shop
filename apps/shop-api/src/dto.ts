/**
 * Maps application and domain values to the contract's DTOs. Mapping only:
 * amounts are copied, never recomputed.
 */
import type { CouponDto, OrderDto, PromotionDto, QuoteDto } from "@demo-shop/api-contract"
import type { CouponRecord, NewOrder, PromotionRecord } from "@demo-shop/application"
import { type Cart, type CouponDiscount, type PricedCart, money } from "@demo-shop/domain"

export function toQuoteDto(cart: Cart, priced: PricedCart): QuoteDto {
  return {
    lines: priced.lines.map((line, index) => ({
      productId: line.productId,
      quantity: cart.lines[index]!.quantity,
      unitPriceMinor: cart.lines[index]!.unitPrice,
      subtotalMinor: line.subtotal,
      discountMinor: line.discount,
      promotionId: line.promotionId,
    })),
    subtotalMinor: priced.subtotal,
    lineDiscountMinor: priced.lineDiscountTotal,
    couponDiscountMinor: priced.couponDiscount,
    couponRejection: priced.couponRejection,
    thresholdDiscountMinor: priced.thresholdDiscount,
    totalMinor: priced.total,
  }
}

export function toOrderDto(order: NewOrder, cart: Cart, priced: PricedCart): OrderDto {
  return { id: order.id, couponCode: order.couponCode, quote: toQuoteDto(cart, priced) }
}

export function toPromotionDto(record: PromotionRecord): PromotionDto {
  return {
    id: record.id,
    name: record.name,
    rule:
      record.kind === "percentage"
        ? { kind: "percentage", percent: record.percent }
        : { kind: "buyTwoGetOne" },
    active: record.active,
    redemptions: record.redemptions,
  }
}

export function toCouponDto(record: CouponRecord): CouponDto {
  return {
    code: record.code,
    discount:
      record.discount.kind === "percentage"
        ? { kind: "percentage", percent: record.discount.percent }
        : { kind: "fixed", amountMinor: record.discount.amount },
    usageLimit: record.usageLimit,
    expiresAt: record.expiresAt,
    active: record.active,
    redemptions: record.redemptions,
  }
}

/** The contract's coupon discount as the domain's `CouponDiscount` (minor units are branded there). */
export function toCouponDiscount(discount: CouponDto["discount"]): CouponDiscount {
  return discount.kind === "percentage"
    ? { kind: "percentage", percent: discount.percent }
    : { kind: "fixed", amount: money(discount.amountMinor) }
}
