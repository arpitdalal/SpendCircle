import { api } from "@spend-circle/convex";
import type { ComparisonRangeMonths, PlainMonth, TransactionType } from "@spend-circle/domain";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { MOCKS } from "../env.js";
import {
  MOCK_CATEGORY_ANALYTICS,
  MOCK_DASHBOARD,
  MOCK_MEMBERS,
  mockMonthlyComparison,
} from "../fixtures.js";
import type { Circle } from "./circles.js";
import type { Member } from "./members.js";

/**
 * The per-Circle Dashboard view contract, derived from `getDashboard` so it can't
 * drift from the backend (ADR 0003): the selected month's Income / Expense / Net in
 * minor units, the recent Transactions feed, the Circle Currency, and the resolved
 * month. `null` ≡ inaccessible Circle (ADR 0016); `undefined` while loading.
 */
export type Dashboard = NonNullable<FunctionReturnType<typeof api.dashboard.getDashboard>>;
export type DashboardTotals = Dashboard["totals"];

/**
 * The per-Circle Dashboard (RPT-3): current-month (or an explicit `month`) Income /
 * Expense / Net totals plus a recent-Transactions feed, optionally narrowed to one
 * Member via the Paid By filter (`paidByMemberId`). Totals and recent both reflect the
 * SAME active set the filter narrows, so they never disagree. `undefined` while
 * loading; `null` for an inaccessible Circle (the guard ejects before this renders).
 * Mock mode returns fixtures and skips the backend (ADR 0006).
 *
 * `enabled: false` skips the query and reads as loading (`undefined`). The route uses
 * it while a URL-carried Paid By id is still being validated against the loaded filter
 * options, so an unverified id is never sent to the backend and unfiltered money never
 * flashes where a filtered view was deep-linked.
 */
export function useDashboard(
  circleId: Circle["id"],
  options?: { month?: PlainMonth; paidByMemberId?: Member["id"]; enabled?: boolean },
) {
  const enabled = options?.enabled ?? true;
  const queried = useQuery(
    api.dashboard.getDashboard,
    MOCKS || !enabled
      ? "skip"
      : {
          circleId,
          ...(options?.month ? { month: options.month } : {}),
          ...(options?.paidByMemberId ? { paidByMemberId: options.paidByMemberId } : {}),
        },
  );
  if (!enabled) {
    return undefined;
  }
  return MOCKS ? MOCK_DASHBOARD : queried;
}

/**
 * The Dashboard's month-over-month comparison view contract, derived from
 * `getMonthlyComparison` so it can't drift from the backend (ADR 0003): a
 * chronological, zero-filled per-month series of Income / Expense / Net in minor
 * units plus the Circle Currency. `null` ≡ inaccessible Circle (ADR 0016);
 * `undefined` while loading.
 */
export type MonthlyComparison = NonNullable<
  FunctionReturnType<typeof api.dashboard.getMonthlyComparison>
>;
export type MonthlyComparisonEntry = MonthlyComparison["series"][number];

/**
 * The Dashboard's month-over-month comparison (RPT-4): `rangeMonths` months (a
 * Comparison Range — 1/3/6/12) ending at `endMonth`, optionally narrowed to one
 * Member via the same Paid By filter the totals use, so the chart and the cards
 * always describe the same activity. `undefined` while loading; `null` for an
 * inaccessible Circle (the guard ejects before this renders). Mock mode derives a
 * deterministic fixture series for the requested window and skips the backend
 * (ADR 0006). `enabled: false` skips the query and reads as loading — see
 * {@link useDashboard}.
 */
export function useMonthlyComparison(
  circleId: Circle["id"],
  options: {
    endMonth: PlainMonth;
    rangeMonths: ComparisonRangeMonths;
    paidByMemberId?: Member["id"];
    enabled?: boolean;
  },
) {
  const enabled = options.enabled ?? true;
  const queried = useQuery(
    api.dashboard.getMonthlyComparison,
    MOCKS || !enabled
      ? "skip"
      : {
          circleId,
          endMonth: options.endMonth,
          rangeMonths: options.rangeMonths,
          ...(options.paidByMemberId ? { paidByMemberId: options.paidByMemberId } : {}),
        },
  );
  if (!enabled) {
    return undefined;
  }
  return MOCKS ? mockMonthlyComparison(options.endMonth, options.rangeMonths) : queried;
}

/**
 * The Members selectable in the Dashboard's Paid By filter: current Members plus
 * Removed Members who are Paid By on a matching active Transaction (RPT-3). Same
 * `Member` shape as `useMembers` (both derive from `toMemberView`), so the selector
 * renders them identically and a Removed option's `status` lets the UI label it.
 * `undefined` while loading; `null` for an inaccessible Circle. Mock mode returns
 * fixtures and skips the backend (ADR 0006).
 */
export function usePaidByFilterOptions(circleId: Circle["id"]): Member[] | null | undefined {
  const queried = useQuery(api.dashboard.getPaidByFilterOptions, MOCKS ? "skip" : { circleId });
  return MOCKS ? MOCK_MEMBERS : queried;
}

/**
 * The Dashboard's category analytics view contract, derived from
 * `getCategoryAnalytics` so it can't drift from the backend (ADR 0003): ranked
 * tagged spend per Category in minor units plus the Circle Currency. `null` ≡
 * inaccessible Circle (ADR 0016); `undefined` while loading.
 */
export type CategoryAnalytics = NonNullable<
  FunctionReturnType<typeof api.dashboard.getCategoryAnalytics>
>;
export type CategoryAnalyticsRow = CategoryAnalytics["rows"][number];

/**
 * Ranked, non-additive category tagged spend for one month (RPT-5), optionally
 * narrowed by transaction `type` and the same Paid By filter the totals use.
 * `undefined` while loading; `null` for an inaccessible Circle. Mock mode returns
 * fixtures and skips the backend (ADR 0006). `enabled: false` skips the query and
 * reads as loading — see {@link useDashboard}.
 */
export function useCategoryAnalytics(
  circleId: Circle["id"],
  options?: {
    month?: PlainMonth;
    type?: TransactionType;
    paidByMemberId?: Member["id"];
    enabled?: boolean;
  },
) {
  const enabled = options?.enabled ?? true;
  const queried = useQuery(
    api.dashboard.getCategoryAnalytics,
    MOCKS || !enabled
      ? "skip"
      : {
          circleId,
          ...(options?.month ? { month: options.month } : {}),
          ...(options?.type ? { type: options.type } : {}),
          ...(options?.paidByMemberId ? { paidByMemberId: options.paidByMemberId } : {}),
        },
  );
  if (!enabled) {
    return undefined;
  }
  return MOCKS ? MOCK_CATEGORY_ANALYTICS : queried;
}
