import { COLOR_PALETTE, categoryUpdateSchema, LIMITS } from "@spend-circle/domain";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ColorPicker } from "~/components/category-form.js";
import { HistoryList } from "~/components/history-list.js";
import { InfiniteScrollFooter } from "~/components/infinite-scroll-footer.js";
import { RowsSkeleton, SkeletonRegion } from "~/components/skeleton.js";
import { Button } from "~/components/ui/button.js";
import { buttonVariants } from "~/components/ui/button-variants.js";
import { Segmented } from "~/components/ui/segmented.js";
import {
  type CategoriesFilters,
  type CategoryLifecycleFilter,
  canonicalCategoriesParams,
  categoryNewHref,
  cleanQueryText,
  hasCategoriesNarrowing,
  readCategoriesFilters,
  type TypeFilter,
} from "~/lib/categories-filter-url.js";
import {
  type CategoriesPage,
  type Category,
  type Circle,
  useArchiveCategory,
  useCategoriesPage,
  useCategoryHistory,
  useRestoreCategory,
  useUpdateCategory,
} from "~/lib/data.js";
import { mutationErrorMessageForUser } from "~/lib/mutation-user-message.js";
import { useReturnToOrigin, withReturnTo } from "~/lib/return-to-url.js";
import { cn } from "~/lib/utils.js";
import { useCircle } from "~/routes/layouts/circle-layout.js";

const TYPE_OPTIONS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

const STATUS_OPTIONS: ReadonlyArray<{ value: CategoryLifecycleFilter; label: string }> = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

/**
 * Circle-scoped Categories surface (PRD stories 47–61; CAT-2 adds edit / archive /
 * restore / history; CAT-4 adds the **Category Filter**; issue #138 shows all types
 * together). All Categories — income and expense — show by default, interleaved
 * newest-first, with a per-row type pill telling the two apart. An All / Expense /
 * Income filter narrows to one type. The server owns the unique-name invariant
 * (case-insensitive, per Circle+type, incl. archived); we surface its rejection
 * inline rather than pre-checking client-side.
 *
 * The Category Filter — the type segment, a tri-state lifecycle status, and a
 * debounced name search — lives in the **URL** (ADR 0016), so a filtered view is
 * shareable and reproducible, never trapped in `useState`. Discrete changes
 * (type, status) PUSH so back walks the filter history; the debounced search
 * REPLACES so typing a word doesn't bury history. The default type and status are
 * both `all` (parity with the ledger's one-picture view): archived rows are
 * distinguished — muted name + "Archived" badge — not hidden. The list paginates at
 * the source via `filterCategories` with automatic infinite scroll (README §4).
 *
 * Per-row affordances are gated on the SERVER-returned capability flags
 * (`canEditFields` — the creator only; `canArchive` — creator or Owner) plus a
 * writable Circle. The flags are a courtesy: the server re-checks every mutation
 * (ADR 0015).
 */
export default function CircleCategories() {
  const circle = useCircle();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = readCategoriesFilters(searchParams);
  const writable = circle.status === "active";
  // The list's full URL (its type, status, search) is the origin the New-category CTA
  // returns to via `returnTo` (#123), so a filtered view round-trips through the new page.
  const origin = useReturnToOrigin();
  const page = useCategoriesPage(circle.id, {
    type: filters.type,
    status: filters.status,
    ...(filters.q ? { query: filters.q } : {}),
  });

  // Canonicalize the address bar (replace) so a copied URL always carries
  // type+status — the transactions route's contract applied here.
  useEffect(() => {
    const next = canonicalCategoriesParams(filters, searchParams);
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [filters, searchParams, setSearchParams]);

  // Discrete control changes (type segment, status segment) PUSH a history entry.
  const applyFilters = (next: CategoriesFilters) => {
    setSearchParams(canonicalCategoriesParams(next, searchParams), { replace: false });
  };

  // The debounced search REPLACES — typing must not bury the back-stack.
  const applySearch = (q: string) => {
    setSearchParams(canonicalCategoriesParams({ ...filters, q }, searchParams), { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-tight">Categories</h2>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Type"
            value={filters.type}
            options={[...TYPE_OPTIONS]}
            onChange={(type) => {
              if (filters.type !== type) {
                applyFilters({ ...filters, type });
              }
            }}
          />
          <Segmented
            label="Status"
            value={filters.status}
            options={[...STATUS_OPTIONS]}
            onChange={(status) => {
              if (filters.status !== status) {
                applyFilters({ ...filters, status });
              }
            }}
          />
        </div>
        <CategorySearchInput value={filters.q} onSearch={applySearch} />
      </div>

      {writable ? (
        <Link
          to={withReturnTo(categoryNewHref(circle, { type: filters.type }), origin)}
          className={buttonVariants()}
        >
          New category
        </Link>
      ) : (
        <p className="rounded-lg border border-border bg-card p-3 shadow-sm text-sm text-muted-foreground">
          This circle is archived. Restore it to add categories.
        </p>
      )}

      <CategoryList page={page} narrowed={hasCategoriesNarrowing(filters)} circle={circle} />
    </div>
  );
}

/** How long typing may pause before the search commits to the URL. */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The Category Filter's name search box. Local state holds the in-flight
 * keystrokes; a ~250ms debounce commits the cleaned text to the URL (replace).
 * `applied` tracks the last value THIS box committed, so an external URL change
 * (back/forward, a shared link) syncs the box without a render-loop, while the
 * box's own canonical echo never clobbers what the user is still typing.
 */
function CategorySearchInput({
  value,
  onSearch,
}: {
  value: string;
  onSearch: (q: string) => void;
}) {
  const [text, setText] = useState(value);
  const applied = useRef(value);

  useEffect(() => {
    if (value !== applied.current) {
      applied.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    const handle = setTimeout(() => {
      const clean = cleanQueryText(text);
      if (clean !== applied.current) {
        applied.current = clean;
        onSearch(clean);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text, onSearch]);

  return (
    <label className="block">
      <span className="sr-only">Search categories by name</span>
      <input
        type="search"
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        placeholder="Search categories…"
        className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30 text-foreground"
      />
    </label>
  );
}

/**
 * The Category Filter's result list — one source-paginated page stream of the
 * selected type scope (all / expense / income), lifecycle scope, and search
 * (CAT-4; issue #138). Each row carries a type pill so the interleaved All view
 * reads unambiguously. Each row offers the
 * affordances the SERVER said this viewer may use (`canEditFields` / `canArchive`
 * — ADR 0015) on a writable Circle, and a History disclosure every current Member
 * may open (PRD story 78). One row at a time edits, and one expands history — a
 * deliberate simplification that keeps the surface calm.
 *
 * Infinite scroll: a sentinel below the list intersects the viewport (with bottom
 * `rootMargin` so the next page starts while the user is still near the last rows).
 * The observer calls `loadMore` only when `status === "CanLoadMore"` so a page
 * already in `LoadingMore` never receives duplicate loads from repeated entries.
 * A persistent `role="status"` live region (content toggles) announces loading more
 * reliably than mounting the region only while `LoadingMore`.
 *
 * The two empty states are deliberately distinct: with no narrowing applied an
 * empty result means the Circle has no Categories yet; with a search, a
 * non-default status, or a concrete type it means the filter matched nothing.
 */
function CategoryList({
  page,
  narrowed,
  circle,
}: {
  page: CategoriesPage;
  narrowed: boolean;
  circle: Circle;
}) {
  const [editingId, setEditingId] = useState<Category["id"] | null>(null);
  const [historyId, setHistoryId] = useState<Category["id"] | null>(null);
  const { categories, status, loadMore } = page;

  // The open-editor / open-history selection is only meaningful while its row is
  // ON the current page. The Category Filter (search, status, type) and reactive
  // changes can drop the row — unmounting closes the UI, but the id up here must
  // not outlive it, or widening the filter would remount the row with a fresh
  // editor/panel popping open unbidden (and an in-progress edit silently gone).
  // The list-membership counterpart of CategoryRow's capability effect below.
  useEffect(() => {
    if (editingId !== null && !categories.some((category) => category.id === editingId)) {
      setEditingId(null);
    }
    if (historyId !== null && !categories.some((category) => category.id === historyId)) {
      setHistoryId(null);
    }
  }, [categories, editingId, historyId]);

  if (status === "LoadingFirstPage") {
    return (
      <SkeletonRegion label="Loading categories…" testId="categories-skeleton">
        <RowsSkeleton rows={5} />
      </SkeletonRegion>
    );
  }
  if (categories.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {/* Not-narrowed implies the default All view (a concrete type counts as
            narrowing now — `hasCategoriesNarrowing`), so the bare empty state is
            always "no Categories at all", never type-specific. */}
        {narrowed ? "No categories match this filter." : "No categories yet."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            circle={circle}
            editing={editingId === category.id}
            onEditToggle={(open) => setEditingId(open ? category.id : null)}
            historyOpen={historyId === category.id}
            onHistoryToggle={(open) => setHistoryId(open ? category.id : null)}
          />
        ))}
      </ul>

      <InfiniteScrollFooter
        status={status}
        loadMore={loadMore}
        loadingCopy="Loading more categories…"
        listAriaLabel="Category list"
        sentinelTestId="categories-infinite-scroll-sentinel"
      />
    </div>
  );
}

function CategoryRow({
  category,
  circle,
  editing,
  onEditToggle,
  historyOpen,
  onHistoryToggle,
}: {
  category: Category;
  circle: Circle;
  editing: boolean;
  onEditToggle: (open: boolean) => void;
  historyOpen: boolean;
  onHistoryToggle: (open: boolean) => void;
}) {
  const writable = circle.status === "active";
  const swatch = COLOR_PALETTE.find((c) => c.id === category.color);
  const isArchived = category.status === "archived";

  // Whether this row may edit is SERVER-derived data (the capability flag, the
  // row's status, the Circle's status) — `editing` alone is just UI state, so the
  // open editor must keep answering to it. If the capability disappears mid-edit
  // (the Owner archives the Category reactively, or the Circle archives), the
  // editor closes rather than offering a form every save would reject.
  const canEdit = writable && category.canEditFields && !isArchived;
  // Also clear the stale `editingId` upstream, so the row doesn't silently hold
  // edit mode and resurrect the editor if the Category is later restored.
  useEffect(() => {
    if (editing && !canEdit) {
      onEditToggle(false);
    }
  }, [editing, canEdit, onEditToggle]);

  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm">
      {editing && canEdit ? (
        <EditCategoryForm category={category} onClose={() => onEditToggle(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ backgroundColor: swatch?.hex }}
          />
          <span className={cn("text-sm font-medium", isArchived && "text-muted-foreground")}>
            {category.name}
          </span>
          {/* Text pill (not color alone) so expense vs income is legible now that
              both types interleave under the default All view (issue #138). */}
          <span className="rounded-full border border-border px-2 py-px text-xs capitalize text-muted-foreground">
            {category.type}
          </span>
          {isArchived ? (
            <span className="rounded-full border border-border bg-muted px-2 py-px text-xs text-muted-foreground">
              Archived
            </span>
          ) : null}
          <span className="ml-auto text-xs text-muted-foreground">
            {category.creator.displayName}
          </span>
          {canEdit ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onEditToggle(true)}
              aria-label={`Edit ${category.name}`}
            >
              Edit
            </Button>
          ) : null}
          {writable && category.canArchive ? (
            <LifecycleButton category={category} action={isArchived ? "restore" : "archive"} />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={historyOpen}
            onClick={() => onHistoryToggle(!historyOpen)}
            aria-label={`History of ${category.name}`}
          >
            History
          </Button>
        </div>
      )}

      {historyOpen ? (
        // Mounted only while expanded, so only the open row subscribes to its
        // paginated history query.
        <div className="mt-3 border-t border-border pt-3">
          <CategoryHistory circleId={circle.id} categoryId={category.id} name={category.name} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * The inline rename/recolor form (creator-only — the server enforces it, ADR 0015).
 * Sends only the fields that differ from the current Category, so an untouched
 * submit is a server-side no-op that records no history.
 */
function EditCategoryForm({ category, onClose }: { category: Category; onClose: () => void }) {
  const updateCategory = useUpdateCategory();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputId = `edit-category-${category.id}`;
  const errorId = `${inputId}-error`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = categoryUpdateSchema.safeParse({ name, color });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the category details.");
      return;
    }

    const changedName = parsed.data.name !== category.name ? parsed.data.name : undefined;
    const changedColor = parsed.data.color !== category.color ? parsed.data.color : undefined;
    if (changedName === undefined && changedColor === undefined) {
      onClose(); // nothing changed — just close, no write
      return;
    }

    setSubmitting(true);
    try {
      await updateCategory({
        categoryId: category.id,
        ...(changedName !== undefined ? { name: changedName } : {}),
        ...(changedColor !== undefined ? { color: changedColor } : {}),
      });
      onClose();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "";
      setError(
        /already exists/i.test(message)
          ? "A category with this name already exists for this type."
          : mutationErrorMessageForUser(caught, "Couldn't save the category. Please try again."),
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label={`Edit ${category.name}`}>
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium">
          Name
        </label>
        <input
          id={inputId}
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (error) {
              setError(null);
            }
          }}
          maxLength={LIMITS.categoryNameMax}
          autoComplete="off"
          aria-invalid={error != null}
          aria-describedby={error ? errorId : undefined}
          className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
      </div>

      <ColorPicker legend="Color" color={color} onChange={setColor} />

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting || name.trim() === ""}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const LIFECYCLE_COPY = {
  archive: { idle: "Archive", busy: "Archiving…", error: "Couldn't archive the category." },
  restore: { idle: "Restore", busy: "Restoring…", error: "Couldn't restore the category." },
};

/**
 * The archive/restore moderation affordance (creator or Owner — the server enforces
 * it, ADR 0015). The action derives from the row's own `status`, so the widened
 * active+archived list shows Archive on active rows and Restore on archived ones.
 * Failures surface inline next to the action (`role="alert"`), never swallowed.
 */
function LifecycleButton({
  category,
  action,
}: {
  category: Category;
  action: "archive" | "restore";
}) {
  const archiveCategory = useArchiveCategory();
  const restoreCategory = useRestoreCategory();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = LIFECYCLE_COPY[action];

  const onClick = async () => {
    setPending(true);
    setError(null);
    try {
      const run = action === "archive" ? archiveCategory : restoreCategory;
      await run({ categoryId: category.id });
    } catch (caught) {
      console.error(`${action}Category failed`, caught);
      setError(mutationErrorMessageForUser(caught, `${copy.error} Please try again.`));
    } finally {
      // Always clear the in-flight flag: on success the row stays mounted in the
      // widened list and `action` flips with the new `status` (the TXN-3 lesson,
      // issue #82).
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={onClick}
        aria-label={`${copy.idle} ${category.name}`}
      >
        {pending ? copy.busy : copy.idle}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
}

/** The Category History panel (PRD story 78) — the paginated audit fed into the shared
 * {@link HistoryList}. Kept a thin wrapper so the data hook stays out of the row shell. */
function CategoryHistory({
  circleId,
  categoryId,
  name,
}: {
  circleId: Circle["id"];
  categoryId: Category["id"];
  name: string;
}) {
  const { events, status, loadMore } = useCategoryHistory(circleId, categoryId);
  return (
    <HistoryList events={events} status={status} loadMore={loadMore} label={`${name} history`} />
  );
}
