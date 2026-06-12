import { useMemo } from "react";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "~/components/ui/combobox.js";

export interface MultiComboboxOption {
  value: string;
  label: string;
  detail?: string;
  color?: string;
}

export function MultiCombobox({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: MultiComboboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const anchorRef = useComboboxAnchor();
  const optionById = useMemo(() => {
    const map = new Map<string, MultiComboboxOption>();
    for (const option of options) {
      map.set(option.value, option);
    }
    return map;
  }, [options]);
  const itemIds = useMemo(() => options.map((option) => option.value), [options]);
  const filter = useMemo(
    () => (id: string, query: string) => {
      const option = optionById.get(id);
      if (!option) {
        return false;
      }
      const needle = query.trim().toLowerCase().replace(/\s+/g, " ");
      if (!needle) {
        return true;
      }
      const hay = `${option.label} ${option.detail ?? ""}`.toLowerCase().replace(/\s+/g, " ");
      return hay.includes(needle);
    },
    [optionById],
  );

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <Combobox
        multiple
        autoHighlight
        disabled={disabled}
        value={value}
        onValueChange={(next) => onChange(next ?? [])}
        items={itemIds}
        itemToStringLabel={(id) => optionById.get(id)?.label ?? id}
        filter={filter}
      >
        <ComboboxChips ref={anchorRef} className="w-full">
          <ComboboxValue>
            {(ids: string[]) => (
              <>
                {ids.map((id) => {
                  const option = optionById.get(id);
                  if (!option) {
                    return null;
                  }
                  return (
                    <ComboboxChip key={id} removeAriaLabel={`Remove ${option.label}`}>
                      {option.label}
                    </ComboboxChip>
                  );
                })}
                <ComboboxChipsInput
                  placeholder={`Search ${label.toLowerCase()}…`}
                  aria-label={label}
                  disabled={disabled}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxEmpty>No options.</ComboboxEmpty>
          <ComboboxList>
            {(id: string) => {
              const option = optionById.get(id);
              if (!option) {
                return null;
              }
              return (
                <ComboboxItem key={id} value={id}>
                  {option.color ? (
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: option.color }}
                      aria-hidden
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="text-xs text-muted-foreground">{option.detail}</span>
                  ) : null}
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
