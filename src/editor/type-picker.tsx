// src/editor/type-picker.tsx
import { useState, useMemo } from "react";
import type { FieldTypePlugin, FieldContext } from "../schema/plugin";
import type { Field } from "../schema/types";
import { Search } from "lucide-react";

export interface TypePickerProps {
  plugins: FieldTypePlugin[];
  context?: FieldContext;
  currentSpec?: Field[];
  onSelect: (pluginId: string) => void;
}

function countByType(spec: Field[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const field of spec) {
    counts.set(field.field_type, (counts.get(field.field_type) ?? 0) + 1);
  }
  return counts;
}

function TypePickerInner({ plugins, context, currentSpec, onSelect }: TypePickerProps) {
  const [search, setSearch] = useState("");

  const filteredPlugins = useMemo(() => {
    let result = plugins;

    if (context) {
      result = result.filter((p) => !p.availableIn || p.availableIn.includes(context));
    }

    if (search.trim()) {
      const term = search.trim().toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.description.toLowerCase().includes(term),
      );
    }

    return result;
  }, [plugins, context, search]);

  const typeCounts = useMemo(
    () => (currentSpec ? countByType(currentSpec) : new Map<string, number>()),
    [currentSpec],
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, FieldTypePlugin[]>();
    for (const plugin of filteredPlugins) {
      const cat = plugin.category;
      if (!groups.has(cat)) {
        groups.set(cat, []);
      }
      groups.get(cat)!.push(plugin);
    }
    return groups;
  }, [filteredPlugins]);

  return (
    <div data-testid="type-picker" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ position: "relative" }}>
        <Search
          size={16}
          style={{
            position: "absolute",
            left: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "#888",
            pointerEvents: "none",
          }}
        />
        <input
          type="text"
          placeholder="Search field types..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search field types"
          style={{
            width: "100%",
            padding: "8px 8px 8px 32px",
            border: "1px solid #ddd",
            borderRadius: "6px",
            fontSize: "14px",
            boxSizing: "border-box",
          }}
        />
      </div>

      {Array.from(grouped.entries()).map(([category, categoryPlugins]) => (
        <div key={category}>
          <h4
            style={{
              margin: "0 0 8px 0",
              fontSize: "12px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#666",
            }}
          >
            {category}
          </h4>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "8px",
            }}
          >
            {categoryPlugins.map((plugin) => {
              const count = typeCounts.get(plugin.id) ?? 0;
              const isAtMax =
                plugin.maxPerSpec !== undefined && count >= plugin.maxPerSpec;
              const Icon = plugin.icon;

              return (
                <button
                  key={plugin.id}
                  type="button"
                  data-testid={`type-option-${plugin.id}`}
                  disabled={isAtMax}
                  onClick={() => onSelect(plugin.id)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    padding: "10px",
                    border: "1px solid #ddd",
                    borderRadius: "6px",
                    background: isAtMax ? "#f5f5f5" : "#fff",
                    cursor: isAtMax ? "not-allowed" : "pointer",
                    opacity: isAtMax ? 0.5 : 1,
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: "2px" }}>
                    <Icon size={18} />
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontWeight: 500, fontSize: "14px" }}>
                      {plugin.name}
                    </span>
                    <span style={{ fontSize: "12px", color: "#666" }}>
                      {plugin.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {grouped.size === 0 && (
        <p style={{ color: "#888", textAlign: "center", padding: "16px" }}>
          No matching field types
        </p>
      )}
    </div>
  );
}

export const TypePicker = TypePickerInner;
(TypePicker as { displayName?: string }).displayName = "TypePicker";
