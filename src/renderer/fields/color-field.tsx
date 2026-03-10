import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { ColorSettings } from "../../schema/field-types/color";

export function ColorField({ field, readOnly }: FieldProps<ColorSettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;

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
              type="color"
              disabled={readOnly}
              style={{
                width: "3rem",
                height: "2rem",
                padding: "2px",
                border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                borderRadius: "4px",
                cursor: readOnly ? "default" : "pointer",
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
ColorField.displayName = "ColorField";
