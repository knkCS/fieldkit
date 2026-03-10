import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";

export function TimeField({ field, readOnly }: FieldProps) {
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
              type="time"
              readOnly={readOnly}
              style={{
                width: "100%",
                padding: "0.5rem",
                border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                borderRadius: "4px",
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
TimeField.displayName = "TimeField";
