import { describe, expect, it } from "vitest";
import {
  TRANSACTION_LIST_PAGE_SIZE,
  TRANSACTION_SEARCH_MAX_PAGE,
} from "./transaction-search-pagination.js";

describe("transaction search pagination constants", () => {
  it("exports stable caps aligned with Convex search", () => {
    expect(TRANSACTION_SEARCH_MAX_PAGE).toBe(40);
    expect(TRANSACTION_LIST_PAGE_SIZE).toBe(25);
  });
});
