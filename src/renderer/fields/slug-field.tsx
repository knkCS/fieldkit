import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { SlugSettings } from "../../schema/field-types/slug";

export function SlugField({ field, readOnly }: FieldProps<SlugSettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;
  const settings = field.settings ?? {};

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor={accessor} style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}>
        {field.config.name}
        {field.config.required && <span style={{ color: "red" }}> *</span>}
      </label>
      <Controller
        name={accessor}
        control={control}
        render={({ field: formField, fieldState }) => (
          <>
            <input
              {...formField}
              id={accessor}
              type="text"
              placeholder="e.g. my-page-slug"
              readOnly={readOnly}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                borderRadius: "4px",
                fontFamily: "monospace",
              }}
            />
            {fieldState.error && (
              <span style={{ color: "red", fontSize: "0.875rem" }}>{fieldState.error.message}</span>
            )}
            {settings.source_field && (
              <span style={{ fontSize: "0.75rem", color: "#999" }}>
                Auto-generated from: {settings.source_field}
              </span>
            )}
          </>
        )}
      />
      {field.config.instructions && (
        <p style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
          {field.config.instructions}
        </p>
      )}
    </div>
  );
}
SlugField.displayName = "SlugField";
