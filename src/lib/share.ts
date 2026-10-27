/**
 * The Cinara Share: how an actor's backend is worked out. Pure functions, so the app, the
 * statements and the tests all agree on the same numbers. Money is in whole cents.
 *
 * - Talent pool: 40% of a show's revenue from the first dollar, rising to 60% for good once the
 *   show's revenue has added up to its production budget. Nothing comes off first.
 * - Points split the pool. Each role's points are set in its contract before the shoot.
 * - Gifts: 90% of each gift to the actor the viewer picked, after card fees. Cinara keeps 10%.
 * - Paid quarterly, within 30 days after the quarter ends.
 */

import type { ShareStatement, ShowShare } from '@/data/types';

export const POOL_START = 0.4;
export const POOL_AFTER = 0.6;
export const GIFT_SHARE = 0.9;
export const PAY_WITHIN_DAYS = 30;

export interface PoolResult {
  poolCents: number;
  /** The pool rate at the end of the period. */
  rate: number;
  /** The show passed its budget during this period. */
  steppedUpNow: boolean;
  /** Revenue still needed before the pool rises (0 once it has). */
  toStepUpCents: number;
}

/**
 * The talent pool for one period. Revenue up to the budget is pooled at 40%, everything past it
 * at 60%, so a period that crosses the line is split at the exact dollar.
 */
export function poolFor(revenueCents: number, earnedBeforeCents: number, budgetCents: number): PoolResult {
  const revenue = Math.max(0, revenueCents);
  const left = Math.max(0, budgetCents - Math.max(0, earnedBeforeCents));
  const atStart = Math.min(revenue, left);
  const atAfter = revenue - atStart;
  return {
    poolCents: Math.round(atStart * POOL_START + atAfter * POOL_AFTER),
    rate: left - atStart > 0 ? POOL_START : POOL_AFTER,
    steppedUpNow: left > 0 && revenue >= left,
    toStepUpCents: left - atStart,
  };
}

/** One role's slice of the pool. Rounded down; leftover cents roll into the next period's pool. */
export function pointsShare(poolCents: number, points: number, totalPoints: number): number {
  if (totalPoints <= 0 || points <= 0) return 0;
  return Math.floor((poolCents * points) / totalPoints);
}

/** The actor's part of the gifts sent to them. */
export function giftShare(grossCents: number, cardFeesCents: number): number {
  return Math.floor(Math.max(0, grossCents - cardFeesCents) * GIFT_SHARE);
}

export interface Quarter {
  /** e.g. "2026-Q4" */
  key: string;
  /** e.g. "Oct–Dec 2026" */
  label: string;
  start: Date;
  /** Last moment of the quarter. */
  end: Date;
  /** Statement and payment due by this date. */
  payBy: Date;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The calendar quarter a date falls in (UTC), with its pay-by date. */
export function quarterOf(date: Date): Quarter {
  const y = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3);
  const start = new Date(Date.UTC(y, q * 3, 1));
  const next = new Date(Date.UTC(y, q * 3 + 3, 1));
  const end = new Date(next.getTime() - 1);
  const payBy = new Date(next.getTime() + (PAY_WITHIN_DAYS - 1) * 86_400_000);
  return {
    key: `${y}-Q${q + 1}`,
    label: `${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]} ${y}`,
    start,
    end,
    payBy,
  };
}

/** The quarter before this one. */
export function previousQuarter(q: Quarter): Quarter {
  return quarterOf(new Date(q.start.getTime() - 1));
}

/** "$1,234.56" (or "$1,234" with whole: true). */
export function money(cents: number, opts: { whole?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const withCommas = String(dollars).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}$${withCommas}${opts.whole ? '' : `.${rest}`}`;
}

/** "412,300" */
export function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "Jan 30, 2027" */
export function shortDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}, ${x.getUTCFullYear()}`;
}

export interface ShowLine extends PoolResult {
  share: ShowShare;
  yourCents: number;
  /** The show's revenue to the end of this period. */
  earnedTotalCents: number;
}

/** Everything the app shows for one show on a statement. */
export function showLine(share: ShowShare): ShowLine {
  const computed = poolFor(share.revenueCents, share.earnedBeforeCents, share.budgetCents);
  // The server is the source of truth: its pool includes cents carried from last quarter.
  const pool = share.poolCents == null ? computed : { ...computed, poolCents: share.poolCents };
  return {
    ...pool,
    share,
    yourCents: share.shareCents ?? pointsShare(pool.poolCents, share.points, share.totalPoints),
    earnedTotalCents: share.earnedBeforeCents + share.revenueCents,
  };
}

export interface StatementTotals {
  shows: ShowLine[];
  showsCents: number;
  giftsCents: number;
  totalCents: number;
  quarter: Quarter;
}

/** A statement's lines and totals. */
export function statementTotals(st: ShareStatement): StatementTotals {
  const shows = st.shows.map(showLine);
  const showsCents = shows.reduce((a, l) => a + l.yourCents, 0);
  const giftsCents = st.gifts.shareCents ?? giftShare(st.gifts.grossCents, st.gifts.cardFeesCents);
  const [y, q] = st.quarter.split('-Q').map(Number);
  return {
    shows,
    showsCents,
    giftsCents,
    totalCents: showsCents + giftsCents,
    quarter: quarterOf(new Date(Date.UTC(y ?? 1970, ((q ?? 1) - 1) * 3, 1))),
  };
}
