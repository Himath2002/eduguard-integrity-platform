export type FilterRule = {
  id: string;
  fieldKey: string;
  value: string;
};

export type FilterOption = {
  value: string;
  label: string;
};

export type FilterDefinition<T> = {
  key: string;
  label: string;
  type?: "select" | "text";
  options?: FilterOption[];
  placeholder?: string;
  hidden?: boolean;
  getValue?: (item: T) => string | number | boolean | null | undefined;
  match?: (item: T, value: string) => boolean;
};

function firstVisibleFieldKey<T>(defs: FilterDefinition<T>[]) {
  return defs.find((d) => !d.hidden)?.key || defs[0]?.key || "";
}

export function createFilterRule<T>(
  defs: FilterDefinition<T>[],
  initialFieldKey?: string,
  initialValue = ""
): FilterRule {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    fieldKey: initialFieldKey || firstVisibleFieldKey(defs),
    value: initialValue,
  };
}

export function applyFilters<T>(
  items: T[],
  rules: FilterRule[],
  defs: FilterDefinition<T>[]
): T[] {
  if (!rules.length) return items;

  const defMap = new Map(defs.map((d) => [d.key, d]));

  return items.filter((item) =>
    rules.every((rule) => {
      const value = String(rule.value || "").trim();
      if (!value) return true;

      const def = defMap.get(rule.fieldKey);
      if (!def) return true;

      if (def.match) return def.match(item, value);

      const raw = def.getValue ? def.getValue(item) : undefined;
      return String(raw ?? "").toLowerCase() === value.toLowerCase();
    })
  );
}
