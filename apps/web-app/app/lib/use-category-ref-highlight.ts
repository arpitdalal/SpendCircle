import { useEffect, useRef, useState } from "react";
import type { Category, PaginationStatus } from "~/lib/data.js";
import { handleUnavailableRefLink, handleUnparseableRefLink } from "./ref-link-failure.js";
import { parseCategoryRef } from "./refs.js";
import { useSnackbar } from "./snackbar.js";

const HIGHLIGHT_MS = 2500;
const MAX_AUTO_LOAD_PAGES = 20;

/**
 * Reads `categoryRef` from the URL, drives auto-`loadMore` until the target row is
 * present, returns the id to highlight, and signals when the param was consumed (#202).
 *
 * URL stripping is owned by the route: `canonicalCategoriesParams` preserves
 * `categoryRef` until {@link categoryRefConsumed} is true, so canonicalize and strip
 * never race in separate `setSearchParams` calls.
 */
export function useCategoryRefHighlight(args: {
  categoryRefRaw: string | undefined;
  categories: { id: Category["id"] }[];
  status: PaginationStatus;
  loadMore: () => void;
}) {
  const { categoryRefRaw, categories, status, loadMore } = args;
  const { showUnavailable } = useSnackbar();

  // `undefined` = not yet read from the URL; `null` = no deep link or already handled.
  const [targetId, setTargetId] = useState<string | null | undefined>(undefined);
  const [highlightedId, setHighlightedId] = useState<Category["id"] | null>(null);
  const [categoryRefConsumed, setCategoryRefConsumed] = useState(false);
  const consumedRef = useRef(false);
  const autoLoadCountRef = useRef(0);
  const lastCategoryRefRaw = useRef(categoryRefRaw);

  // Each distinct `categoryRef` is its own resolution session. React Router reuses this
  // route when a second notification arrives, so stale consumed/target state must reset.
  // react-doctor-disable-next-line react-doctor/no-event-handler -- URL-driven session reset, not a click handler.
  useEffect(() => {
    if (categoryRefRaw === lastCategoryRefRaw.current) {
      return;
    }
    lastCategoryRefRaw.current = categoryRefRaw;
    consumedRef.current = false;
    autoLoadCountRef.current = 0;
    setTargetId(undefined);
    setHighlightedId(null);
    if (categoryRefRaw != null) {
      setCategoryRefConsumed(false);
    }
  }, [categoryRefRaw]);

  // react-doctor-disable-next-line react-doctor/no-event-handler -- deep-link must self-heal on load; no single user event owns it.
  useEffect(() => {
    if (targetId !== undefined) {
      return;
    }
    if (!categoryRefRaw) {
      setTargetId(null);
      return;
    }
    const parsed = parseCategoryRef(categoryRefRaw);
    if (!parsed) {
      handleUnparseableRefLink({
        rawRef: categoryRefRaw,
        reportMessage: "Unparseable categoryRef in URL",
        showUnavailable,
        onConsumed: () => {
          setCategoryRefConsumed(true);
          setTargetId(null);
        },
      });
      return;
    }
    setTargetId(parsed.id);
  }, [targetId, categoryRefRaw, showUnavailable]);

  const matchedCategory =
    targetId != null ? categories.find((category) => category.id === targetId) : undefined;

  // react-doctor-disable-next-line react-doctor/no-event-handler -- auto-load / highlight / not-found are URL-driven, not a click handler.
  useEffect(() => {
    if (targetId === undefined || targetId === null || consumedRef.current) {
      return;
    }

    if (matchedCategory) {
      consumedRef.current = true;
      setCategoryRefConsumed(true);
      setHighlightedId(matchedCategory.id);
      const timer = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
      return () => window.clearTimeout(timer);
    }

    if (status === "LoadingFirstPage" || status === "LoadingMore") {
      return;
    }

    if (status === "CanLoadMore") {
      if (autoLoadCountRef.current >= MAX_AUTO_LOAD_PAGES) {
        consumedRef.current = true;
        handleUnavailableRefLink({
          showUnavailable,
          onConsumed: () => {
            setCategoryRefConsumed(true);
            setTargetId(null);
          },
        });
        return;
      }
      autoLoadCountRef.current += 1;
      loadMore();
      return;
    }

    consumedRef.current = true;
    handleUnavailableRefLink({
      showUnavailable,
      onConsumed: () => {
        setCategoryRefConsumed(true);
        setTargetId(null);
      },
    });
  }, [loadMore, matchedCategory, showUnavailable, status, targetId]);

  return { highlightedId, categoryRefConsumed };
}
