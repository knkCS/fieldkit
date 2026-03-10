import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { ArraySettings } from "../../schema/field-types/array";

export function ArrayField({ field, readOnly }: FieldProps<ArraySettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;
  const settings = field.settings ?? {};
  const mode = settings.mode ?? "dynamic";

  if (mode === "keyed") {
    return <KeyedArrayField field={field} readOnly={readOnly} />;
  }

  return <DynamicArrayField field={field} readOnly={readOnly} />;
}
ArrayField.displayName = "ArrayField";

function DynamicArrayField({ field, readOnly }: FieldProps<ArraySettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;

  const { fields: items, append, remove } = useFieldArray({
    control,
    name: accessor,
  });

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
        <label style={{ fontWeight: 500 }}>
          {field.config.name}
          {field.config.required && <span style={{ color: "red" }}> *</span>}
        </label>
        {!readOnly && (
          <button
            type="button"
            onClick={() => append({ key: "", value: "" })}
            style={{
              padding: "0.25rem 0.75rem",
              border: "1px solid #ccc",
              borderRadius: "4px",
              background: "white",
              cursor: "pointer",
            }}
          >
            Add pair
          </button>
        )}
      </div>
      {field.config.instructions && (
        <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
          {field.config.instructions}
        </p>
      )}
      {items.map((item, index) => (
        <div key={item.id} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
          <Controller
            name={`${accessor}.${index}.key`}
            control={control}
            render={({ field: formField }) => (
              <input
                {...formField}
                placeholder="Key"
                readOnly={readOnly}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
            )}
          />
          <Controller
            name={`${accessor}.${index}.value`}
            control={control}
            render={({ field: formField }) => (
              <input
                {...formField}
                placeholder="Value"
                readOnly={readOnly}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
            )}
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(index)}
              style={{
                padding: "0.25rem 0.5rem",
                border: "1px solid #ccc",
                borderRadius: "4px",
                background: "white",
                cursor: "pointer",
                fontSize: "0.75rem",
              }}
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {items.length === 0 && (
        <p style={{ fontSize: "0.875rem", color: "#999", fontStyle: "italic" }}>
          No entries added yet.
        </p>
      )}
    </div>
  );
}
DynamicArrayField.displayName = "DynamicArrayField";

function KeyedArrayField({ field, readOnly }: FieldProps<ArraySettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;
  const settings = field.settings ?? {};
  const keys = settings.keys ?? [];

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
        {field.config.name}
        {field.config.required && <span style={{ color: "red" }}> *</span>}
      </label>
      {field.config.instructions && (
        <p style={{ fontSize: "0.875rem", color: "#666", marginBottom: "0.5rem" }}>
          {field.config.instructions}
        </p>
      )}
      {keys.map((key) => (
        <div key={key} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "center" }}>
          <span style={{ minWidth: "100px", fontSize: "0.875rem", fontWeight: 500 }}>{key}</span>
          <Controller
            name={`${accessor}.${key}`}
            control={control}
            render={({ field: formField }) => (
              <input
                {...formField}
                placeholder={`Value for ${key}`}
                readOnly={readOnly}
                style={{
                  flex: 1,
                  padding: "0.5rem",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
            )}
          />
        </div>
      ))}
      {keys.length === 0 && (
        <p style={{ fontSize: "0.875rem", color: "#999", fontStyle: "italic" }}>
          No keys configured.
        </p>
      )}
    </div>
  );
}
KeyedArrayField.displayName = "KeyedArrayField";
