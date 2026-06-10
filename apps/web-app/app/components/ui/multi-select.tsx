import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "~/lib/utils.js";

export interface MultiSelectOption {
  value: string;
  label: string;
  detail?: string;
  color?: string;
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const selectedOptions = options.filter((option) => selected.has(option.value));
  const visibleOptions = useMemo(() => {
    const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!needle) {
      return options;
    }
    return options.filter((option) =>
      `${option.label} ${option.detail ?? ""}`.toLowerCase().replace(/\s+/g, " ").includes(needle),
    );
  }, [options, query]);

  const toggle = (id: string) => {
    if (selected.has(id)) {
      onChange(value.filter((item) => item !== id));
    } else {
      onChange([...value, id].sort());
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">
        {label}
        <input
          type="search"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.currentTarget.value)}
          className="mt-1 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-sm outline-none transition-[border-color,box-shadow] duration-150 focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-50"
        />
      </label>
      {selectedOptions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              disabled={disabled}
              onClick={() => toggle(option.value)}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/40 bg-primary-soft px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/70 disabled:opacity-50"
            >
              <span className="truncate">{option.label}</span>
              <X className="size-3 shrink-0" />
            </button>
          ))}
        </div>
      ) : null}
      <div
        className={cn(
          "max-h-48 overflow-y-auto rounded-md border border-border bg-card/50",
          disabled ? "opacity-50" : "",
        )}
      >
        {visibleOptions.length > 0 ? (
          visibleOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted/60"
            >
              <input
                type="checkbox"
                disabled={disabled}
                checked={selected.has(option.value)}
                onChange={() => toggle(option.value)}
                className="accent-(--primary)"
              />
              {option.color ? (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: option.color }}
                  aria-hidden="true"
                />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.detail ? (
                <span className="text-xs text-muted-foreground">{option.detail}</span>
              ) : null}
            </label>
          ))
        ) : (
          <p className="px-3 py-2 text-sm text-muted-foreground">No options</p>
        )}
      </div>
    </div>
  );
}
