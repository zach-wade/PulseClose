"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileCode } from "lucide-react";

// G5.2 — Structured investor criteria editor.
//
// Replaces the bare-textarea JSON view (still available behind a toggle)
// with one row per criteria_key + the right input widget per type.
// Schema knowledge lives in CRITERIA_SPEC below; if the engine ever
// gains a new criteria_key, add a row here so the lender doesn't have to
// hand-type JSON.

export interface CriterionRow {
  criteria_key: string;
  criteria_value: unknown;
}

type Spec =
  | { kind: "number"; label: string; help?: string; min?: number; max?: number; step?: number }
  | { kind: "percent_decimal"; label: string; help?: string }
  | { kind: "string_list"; label: string; help?: string; options?: string[] }
  | { kind: "boolean"; label: string; help?: string }
  | { kind: "json"; label: string; help?: string };

const STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

const CRITERIA_SPEC: Record<string, Spec> = {
  loan_types: { kind: "string_list", label: "Loan types", help: "e.g. bridge, fix_flip, ground_up, dscr", options: ["bridge", "fix_flip", "ground_up", "dscr", "rental"] },
  property_types: { kind: "string_list", label: "Property types", help: "Allowed types", options: ["sfr", "2_4_unit", "condo", "townhouse", "multifamily", "mixed_use", "commercial"] },
  excluded_property_types: { kind: "string_list", label: "Excluded property types", help: "Hard nos", options: ["sfr", "2_4_unit", "condo", "townhouse", "multifamily", "mixed_use", "commercial"] },
  allowed_states: { kind: "string_list", label: "Allowed states", help: "Empty = all", options: STATE_CODES },
  excluded_states: { kind: "string_list", label: "Excluded states", help: "Hard nos", options: STATE_CODES },
  min_loan_amount: { kind: "number", label: "Min loan amount ($)", help: "Whole dollars", min: 0, step: 1000 },
  max_loan_amount: { kind: "number", label: "Max loan amount ($)", help: "Whole dollars", min: 0, step: 1000 },
  min_fico: { kind: "number", label: "Min FICO", min: 300, max: 850, step: 1 },
  min_experience: { kind: "number", label: "Min experience tier", help: "1 = most experienced, 4 = first-timer", min: 1, max: 4, step: 1 },
  max_ltv: { kind: "percent_decimal", label: "Max LTV", help: "Decimal — 0.75 = 75%" },
  max_ltc: { kind: "percent_decimal", label: "Max LTC", help: "Decimal — 0.90 = 90%" },
  max_ltarv: { kind: "percent_decimal", label: "Max LTARV", help: "Decimal — 0.75 = 75%" },
  rural_allowed: { kind: "boolean", label: "Rural allowed" },
  allowed_occupancy: { kind: "string_list", label: "Allowed occupancy", options: ["owner_occupied", "non_owner_occupied", "investment"] },
  leverage_matrix: { kind: "json", label: "Leverage matrix", help: "Array of tiers — JSON only" },
  rate_adjusters: { kind: "json", label: "Rate adjusters", help: "Array of adjusters — JSON only" },
};

const CRITERIA_KEYS = Object.keys(CRITERIA_SPEC);

interface Props {
  initial: CriterionRow[];
  onSave: (rows: CriterionRow[]) => Promise<void> | void;
  onCancel: () => void;
  saving?: boolean;
}

export function InvestorCriteriaEditor({ initial, onSave, onCancel, saving }: Props) {
  const [rows, setRows] = useState<CriterionRow[]>(() => initial);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonText, setJsonText] = useState(() => JSON.stringify(initial, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState("");

  const usedKeys = useMemo(() => new Set(rows.map((r) => r.criteria_key)), [rows]);
  const availableKeys = useMemo(
    () => CRITERIA_KEYS.filter((k) => !usedKeys.has(k)),
    [usedKeys],
  );

  function patchRow(idx: number, value: unknown) {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, criteria_value: value } : r)),
    );
  }

  function removeRow(idx: number) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRow() {
    const key = newKey.trim();
    if (!key) return;
    if (rows.some((r) => r.criteria_key === key)) return;
    const spec = CRITERIA_SPEC[key];
    const defaultValue: unknown =
      spec?.kind === "string_list"
        ? []
        : spec?.kind === "boolean"
          ? false
          : spec?.kind === "json"
            ? []
            : null;
    setRows((prev) => [...prev, { criteria_key: key, criteria_value: defaultValue }]);
    setNewKey("");
    setAdding(false);
  }

  async function handleSave() {
    if (jsonMode) {
      try {
        const parsed = JSON.parse(jsonText);
        if (!Array.isArray(parsed)) throw new Error("Top-level must be a JSON array");
        for (const r of parsed as Array<{ criteria_key: unknown }>) {
          if (typeof r?.criteria_key !== "string") {
            throw new Error("Every row needs a string criteria_key");
          }
        }
        await onSave(parsed as CriterionRow[]);
      } catch (e) {
        setJsonError(e instanceof Error ? e.message : String(e));
      }
      return;
    }
    await onSave(rows);
  }

  function syncToJsonMode() {
    setJsonText(JSON.stringify(rows, null, 2));
    setJsonError(null);
    setJsonMode(true);
  }

  function syncFromJsonMode() {
    try {
      const parsed = JSON.parse(jsonText);
      if (!Array.isArray(parsed)) throw new Error("Top-level must be a JSON array");
      setRows(parsed);
      setJsonError(null);
      setJsonMode(false);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {jsonMode
            ? "Raw JSON mode — full control, including unrecognized criteria_keys."
            : "Structured mode — one row per known criteria_key with the right input type. Toggle to JSON for unrecognized keys or bulk paste."}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={jsonMode ? syncFromJsonMode : syncToJsonMode}
        >
          <FileCode className="mr-2 h-3 w-3" />
          {jsonMode ? "Back to structured" : "Switch to JSON"}
        </Button>
      </div>

      {jsonMode ? (
        <div className="space-y-2">
          <textarea
            className="font-mono text-xs w-full h-72 border border-input rounded-md p-2 bg-transparent"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />
          {jsonError && <p className="text-sm text-destructive">{jsonError}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground italic">
              No criteria yet. Add one below.
            </p>
          )}
          {rows.map((row, idx) => {
            const spec = CRITERIA_SPEC[row.criteria_key];
            return (
              <div
                key={`${row.criteria_key}-${idx}`}
                className="rounded-md border p-3 space-y-2 bg-muted/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="font-medium">
                      {spec?.label ?? row.criteria_key}
                    </Label>
                    <Badge variant="outline" className="text-[10px]">
                      {row.criteria_key}
                    </Badge>
                    {!spec && (
                      <Badge variant="secondary" className="text-[10px]">
                        unrecognized
                      </Badge>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeRow(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                {spec?.help && (
                  <p className="text-xs text-muted-foreground">{spec.help}</p>
                )}
                <CriterionInput row={row} spec={spec} onChange={(v) => patchRow(idx, v)} />
              </div>
            );
          })}

          {adding ? (
            <div className="flex items-center gap-2">
              <select
                className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              >
                <option value="">— Pick a criteria_key —</option>
                {availableKeys.map((k) => (
                  <option key={k} value={k}>
                    {CRITERIA_SPEC[k].label} ({k})
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={addRow} disabled={!newKey}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add criterion
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save criteria"}
        </Button>
      </div>
    </div>
  );
}

function CriterionInput({
  row,
  spec,
  onChange,
}: {
  row: CriterionRow;
  spec: Spec | undefined;
  onChange: (v: unknown) => void;
}) {
  if (!spec) {
    return (
      <textarea
        className="font-mono text-xs w-full h-20 border border-input rounded-md p-2 bg-transparent"
        value={JSON.stringify(row.criteria_value)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            // hold the raw text in flight; the outer save will surface
          }
        }}
      />
    );
  }

  if (spec.kind === "number") {
    return (
      <Input
        type="number"
        value={
          typeof row.criteria_value === "number" ? row.criteria_value : ""
        }
        min={spec.min}
        max={spec.max}
        step={spec.step}
        onChange={(e) => {
          const v = e.target.value === "" ? null : Number(e.target.value);
          onChange(Number.isFinite(v) ? v : null);
        }}
      />
    );
  }

  if (spec.kind === "percent_decimal") {
    const asPct =
      typeof row.criteria_value === "number"
        ? (row.criteria_value * 100).toFixed(2).replace(/\.?0+$/, "")
        : "";
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={asPct}
          min={0}
          max={100}
          step={0.5}
          onChange={(e) => {
            if (e.target.value === "") {
              onChange(null);
              return;
            }
            // Clamp to [0, 1] — LTV/LTC/LTARV above 100% are non-physical
            // and previously silently saved (e.g. max_ltv: 1.5).
            const raw = Number(e.target.value) / 100;
            if (!Number.isFinite(raw)) {
              onChange(null);
              return;
            }
            const clamped = Math.min(1, Math.max(0, raw));
            onChange(clamped);
          }}
        />
        <span className="text-sm text-muted-foreground">%</span>
        <span className="text-xs text-muted-foreground">
          (stored as{" "}
          {typeof row.criteria_value === "number"
            ? row.criteria_value.toFixed(2)
            : "—"}
          )
        </span>
      </div>
    );
  }

  if (spec.kind === "boolean") {
    const checked = row.criteria_value === true;
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {checked ? "Yes" : "No"}
      </label>
    );
  }

  if (spec.kind === "string_list") {
    const list = Array.isArray(row.criteria_value)
      ? (row.criteria_value as string[])
      : [];
    const options = spec.options ?? [];
    return (
      <div className="space-y-2">
        {options.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {options.map((opt) => {
              const active = list.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(
                      active ? list.filter((x) => x !== opt) : [...list, opt],
                    );
                  }}
                  className={`text-xs px-2 py-0.5 rounded-md border ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        ) : null}
        <Input
          placeholder="Comma-separated values, or pick from chips above"
          value={list.join(", ")}
          onChange={(e) => {
            const items = e.target.value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            onChange(items);
          }}
        />
      </div>
    );
  }

  // json kind
  return (
    <textarea
      className="font-mono text-xs w-full h-32 border border-input rounded-md p-2 bg-transparent"
      value={JSON.stringify(row.criteria_value, null, 2)}
      onChange={(e) => {
        try {
          onChange(JSON.parse(e.target.value));
        } catch {
          // hold raw in flight
        }
      }}
    />
  );
}
