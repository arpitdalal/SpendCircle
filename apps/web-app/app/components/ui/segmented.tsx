import { cn } from "~/lib/utils.js";

/**
 * A small labeled segmented control (a fieldset of `aria-pressed` buttons) for
 * the filter surfaces — Type and Status on the ledger Filters panel, Transaction
 * Search, and the Categories page's Category Filter. One definition so the three
 * surfaces can't drift (it was copy-pasted per route before CAT-4 added a third).
 */
export function Segmented<Value extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: Value;
  options: { label: string; value: Value }[];
  onChange: (value: Value) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs text-muted-foreground">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-md border px-3 py-1 text-sm transition-colors",
              value === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
