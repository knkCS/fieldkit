import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";

export function BooleanField({ field, readOnly }: FieldProps) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <Controller
        name={accessor}
        control={control}
        render={({ field: formField }) => (
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: readOnly ? "default" : "pointer" }}>
            <input
              type="checkbox"
              checked={!!formField.value}
              onChange={(e) => formField.onChange(e.target.checked)}
              disabled={readOnly}
              id={accessor}
            />
            <span style={{ fontWeight: 500 }}>{field.config.name}</span>
          </label>
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
BooleanField.displayName = "BooleanField";
