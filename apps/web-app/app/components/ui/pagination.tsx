import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "~/components/ui/button.js";
import { cn } from "~/lib/utils.js";

function visiblePageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 9) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const bag = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...bag].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  let previous = 0;
  for (const value of sorted) {
    if (previous > 0 && value - previous > 1) {
      out.push("ellipsis");
    }
    out.push(value);
    previous = value;
  }
  return out;
}

export function Pagination({
  currentPage,
  totalPages,
  onSelectPage,
  totalCountCapped,
  className,
}: {
  currentPage: number;
  totalPages: number;
  onSelectPage: (page: number) => void;
  totalCountCapped?: boolean;
  className?: string;
}) {
  if (totalPages <= 1) {
    return totalCountCapped ? (
      <p className={cn("text-center text-xs text-muted-foreground", className)}>
        Additional matches may exist beyond the scanned range.
      </p>
    ) : null;
  }

  const items = visiblePageItems(currentPage, totalPages);

  return (
    <div className={cn("space-y-2", className)}>
      <nav
        aria-label="Search results pages"
        className="flex flex-wrap items-center justify-center gap-1"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Previous page"
          disabled={currentPage <= 1}
          onClick={() => onSelectPage(currentPage - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <ol className="flex flex-wrap items-center justify-center gap-1">
          {items.map((item, index) => {
            if (item === "ellipsis") {
              const left = items[index - 1] ?? "start";
              const right = items[index + 1] ?? "end";
              return (
                <li
                  key={`ellipsis-${String(left)}-${String(right)}`}
                  className="px-1 text-muted-foreground"
                  aria-hidden
                >
                  …
                </li>
              );
            }
            return (
              <li key={item}>
                <Button
                  type="button"
                  variant={item === currentPage ? "default" : "outline"}
                  size="sm"
                  className="min-w-9"
                  aria-label={`Page ${item}`}
                  aria-current={item === currentPage ? "page" : undefined}
                  onClick={() => onSelectPage(item)}
                >
                  {item}
                </Button>
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Next page"
          disabled={currentPage >= totalPages}
          onClick={() => onSelectPage(currentPage + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </nav>
      {totalCountCapped ? (
        <p className="text-center text-xs text-muted-foreground">
          Result total is capped — refine filters for a narrower set.
        </p>
      ) : null}
    </div>
  );
}
