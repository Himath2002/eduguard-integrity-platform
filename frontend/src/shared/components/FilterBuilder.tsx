import { useEffect, useMemo, useRef, useState } from "react";
import { createFilterRule, type FilterDefinition, type FilterRule } from "@/shared/lib/filtering";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 6h16l-6.5 7.5V19l-3 1v-6.5L4 6Z" />
    </svg>
  );
}

function removeRuleById(rules: FilterRule[], ruleId: string) {
  return rules.filter((rule) => rule.id !== ruleId);
}

export default function FilterBuilder<T>({
  fields,
  rules,
  onChange,
  onClear,
  quickFieldKey,
  quickPlaceholder = "Search...",
}: {
  title?: string;
  subtitle?: string;
  fields: FilterDefinition<T>[];
  rules: FilterRule[];
  onChange: (next: FilterRule[]) => void;
  onAdd?: () => void;
  onClear?: () => void;
  quickFieldKey?: string;
  quickPlaceholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftFieldKey, setDraftFieldKey] = useState("");
  const [draftValue, setDraftValue] = useState("");

  const visibleFields = useMemo(() => fields.filter((field) => !field.hidden), [fields]);
  const quickRule = quickFieldKey ? rules.find((rule) => rule.fieldKey === quickFieldKey) : undefined;
  const quickValue = quickRule?.value || "";
  const activeRules = useMemo(
    () => rules.filter((rule) => rule.fieldKey !== quickFieldKey),
    [quickFieldKey, rules]
  );

  const activeFieldKeys = useMemo(() => new Set(activeRules.map((rule) => rule.fieldKey)), [activeRules]);
  const availableFields = useMemo(
    () => visibleFields.filter((field) => !activeFieldKeys.has(field.key)),
    [activeFieldKeys, visibleFields]
  );

  const draftField = useMemo(
    () => visibleFields.find((field) => field.key === draftFieldKey) || availableFields[0],
    [availableFields, draftFieldKey, visibleFields]
  );

  useEffect(() => {
    if (!pickerOpen) return;
    const nextField = draftField?.key || availableFields[0]?.key || "";
    setDraftFieldKey(nextField);
    if (!nextField) {
      setDraftValue("");
      return;
    }
    const def = visibleFields.find((field) => field.key === nextField);
    const nextValue = def?.type === "text" ? "" : def?.options?.[0]?.value || "";
    setDraftValue(nextValue);
  }, [availableFields, draftField?.key, pickerOpen, visibleFields]);

  useEffect(() => {
    if (!pickerOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerOpen]);

  const updateRule = (ruleId: string, patch: Partial<FilterRule>) => {
    onChange(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  };

  const removeRule = (ruleId: string) => {
    onChange(removeRuleById(rules, ruleId));
  };

  const setQuickSearch = (value: string) => {
    if (!quickFieldKey) return;

    if (!value.trim()) {
      onChange(rules.filter((rule) => rule.fieldKey !== quickFieldKey));
      return;
    }

    if (quickRule) {
      updateRule(quickRule.id, { value });
      return;
    }

    onChange([...rules, createFilterRule<T>(fields, quickFieldKey, value)]);
  };

  const handleDraftFieldChange = (fieldKey: string) => {
    setDraftFieldKey(fieldKey);
    const selectedField = visibleFields.find((field) => field.key === fieldKey);
    setDraftValue(selectedField?.type === "text" ? "" : selectedField?.options?.[0]?.value || "");
  };

  const addDraftRule = () => {
    if (!draftField) return;

    const nextValue = draftField.type === "text" ? draftValue.trim() : draftValue;
    if (!nextValue) return;

    onChange([...rules, createFilterRule<T>(fields, draftField.key, nextValue)]);
    setPickerOpen(false);
    setDraftFieldKey("");
    setDraftValue("");
  };

  const clearAll = () => {
    if (onClear) {
      onClear();
      return;
    }
    const preserved = quickFieldKey ? rules.filter((rule) => rule.fieldKey === quickFieldKey && rule.value.trim()) : [];
    onChange(preserved);
  };

  const hasAnyFilters = Boolean(quickValue.trim()) || activeRules.length > 0;

  return (
    <div
      ref={rootRef}
      className={[
        "relative isolate overflow-visible rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5",
        pickerOpen ? "z-[70]" : "z-20",
      ].join(" ")}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {quickFieldKey ? (
          <label className="relative block w-full lg:max-w-xl lg:flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <SearchIcon />
            </span>
            <input
              value={quickValue}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder={quickPlaceholder}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-11 pr-10 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            />
            {quickValue ? (
              <button
                type="button"
                onClick={() => setQuickSearch("")}
                className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </label>
        ) : (
          <div />
        )}

        <div className="flex items-center justify-end gap-2">
          {hasAnyFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Clear
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            disabled={availableFields.length === 0}
            className="relative z-10 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FilterIcon />
            <span>Filter</span>
            {activeRules.length > 0 ? (
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">{activeRules.length}</span>
            ) : null}
          </button>
        </div>
      </div>

      {pickerOpen ? (
        <div className="eg-filter-popover absolute right-4 top-[calc(100%+0.5rem)] z-[80] w-[min(26rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-200 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
          <div className="text-sm font-semibold text-slate-900">Add filter</div>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Filter type
              </label>
              <select
                value={draftField?.key || ""}
                onChange={(e) => handleDraftFieldChange(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              >
                {availableFields.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Value
              </label>
              {draftField?.type === "text" ? (
                <input
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  placeholder={draftField?.placeholder || "Type a value"}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                />
              ) : (
                <select
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                >
                  {(draftField?.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addDraftRule}
              disabled={!draftField || !(draftField.type === "text" ? draftValue.trim() : draftValue)}
              className="rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add filter
            </button>
          </div>
        </div>
      ) : null}

      {activeRules.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeRules.map((rule) => {
            const field = fields.find((item) => item.key === rule.fieldKey);
            const inputType = field?.type || "select";

            return (
              <div
                key={rule.id}
                className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 shadow-sm"
              >
                <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-sm">
                  {field?.label || "Filter"}
                </span>

                {inputType === "text" ? (
                  <input
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder={field?.placeholder || "Type to filter"}
                    className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  />
                ) : (
                  <select
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    className="min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                  >
                    {(field?.options || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}

                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
                  aria-label={`Remove ${field?.label || "filter"}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
