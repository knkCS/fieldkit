import { useState, useEffect, useCallback } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { TocReferenceSettings } from "../../schema/field-types/toc-reference";
import { useFieldKit } from "../provider";
import type { ReferenceItem } from "../adapters";

export function TocReferenceField({ field, readOnly }: FieldProps<TocReferenceSettings>) {
  const { control } = useFormContext();
  const { adapters } = useFieldKit();
  const accessor = field.config.api_accessor;
  const settings = field.settings ?? {};
  const refAdapter = adapters.reference;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ReferenceItem[]>([]);
  const [resolvedItem, setResolvedItem] = useState<ReferenceItem | null>(null);
  const [searching, setSearching] = useState(false);

  const resolveId = useCallback(
    async (id: string) => {
      if (!refAdapter || !id) {
        setResolvedItem(null);
        return;
      }
      try {
        const items = await refAdapter.fetch([id]);
        setResolvedItem(items[0] ?? null);
      } catch {
        setResolvedItem(null);
      }
    },
    [refAdapter],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      if (!refAdapter || query.length === 0) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      try {
        const results = await refAdapter.search(settings.blueprints ?? [], query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [refAdapter, settings.blueprints],
  );

  if (!refAdapter) {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
          {field.config.name}
        </label>
        <p style={{ color: "#999", fontSize: "0.875rem" }}>Reference adapter not configured</p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={accessor} style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
        {field.config.name}
        {field.config.required && <span style={{ color: "red" }}> *</span>}
      </label>
      <Controller
        name={accessor}
        control={control}
        render={({ field: formField, fieldState }) => {
          const currentId = typeof formField.value === "string" ? formField.value : "";

          // Resolve display name on mount / value change
          // eslint-disable-next-line react-hooks/rules-of-hooks
          useEffect(() => {
            resolveId(currentId);
          }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

          const handleSelect = (item: ReferenceItem) => {
            formField.onChange(item.id);
            setSearchQuery("");
            setSearchResults([]);
          };

          const handleClear = () => {
            formField.onChange("");
            setResolvedItem(null);
          };

          return (
            <>
              {/* Selected item */}
              {currentId && (
                <div style={{ marginBottom: "0.5rem" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      padding: "0.25rem 0.5rem",
                      backgroundColor: "#f0f0f0",
                      borderRadius: "4px",
                      fontSize: "0.875rem",
                    }}
                  >
                    {resolvedItem?.display_name ?? currentId}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={handleClear}
                        style={{
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          padding: "0 2px",
                          fontSize: "1rem",
                          lineHeight: 1,
                        }}
                        aria-label={`Remove ${resolvedItem?.display_name ?? currentId}`}
                      >
                        x
                      </button>
                    )}
                  </span>
                </div>
              )}

              {/* Search input */}
              {!readOnly && !currentId && (
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      handleSearch(e.target.value);
                    }}
                    placeholder="Search TOC reference..."
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                      borderRadius: "4px",
                    }}
                  />
                  {searching && (
                    <span style={{ position: "absolute", right: "0.5rem", top: "0.5rem", color: "#999", fontSize: "0.75rem" }}>
                      Searching...
                    </span>
                  )}
                  {searchResults.length > 0 && (
                    <ul
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        backgroundColor: "white",
                        border: "1px solid #ccc",
                        borderTop: "none",
                        borderRadius: "0 0 4px 4px",
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        maxHeight: "200px",
                        overflowY: "auto",
                        zIndex: 10,
                      }}
                    >
                      {searchResults.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => handleSelect(item)}
                            style={{
                              width: "100%",
                              textAlign: "left",
                              padding: "0.5rem",
                              border: "none",
                              background: "none",
                              cursor: "pointer",
                            }}
                          >
                            {item.display_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {fieldState.error && (
                <span style={{ color: "red", fontSize: "0.875rem" }}>{fieldState.error.message}</span>
              )}
            </>
          );
        }}
      />
      {field.config.instructions && (
        <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
          {field.config.instructions}
        </p>
      )}
    </div>
  );
}
TocReferenceField.displayName = "TocReferenceField";
