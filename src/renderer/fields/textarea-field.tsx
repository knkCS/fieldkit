import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { TextareaSettings } from "../../schema/field-types/textarea";

export function TextareaField({ field, readOnly }: FieldProps<TextareaSettings>) {
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
            <textarea
              {...formField}
              id={accessor}
              placeholder={settings.placeholder ?? ""}
              rows={settings.rows ?? 4}
              readOnly={readOnly}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                borderRadius: "4px",
                resize: "vertical",
              }}
            />
            {fieldState.error && (
              <span style={{ color: "red", fontSize: "0.875rem" }}>{fieldState.error.message}</span>
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
TextareaField.displayName = "TextareaField";
