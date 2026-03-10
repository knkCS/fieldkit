import { Controller, useFormContext } from "react-hook-form";
import type { FieldProps } from "../../schema/plugin";
import type { SelectSettings } from "../../schema/field-types/select";

export function SelectField({ field, readOnly }: FieldProps<SelectSettings>) {
  const { control } = useFormContext();
  const accessor = field.config.api_accessor;
  const settings = field.settings ?? { options: {} };
  const options = settings.options ?? {};

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
            {settings.multiple ? (
              <select
                {...formField}
                id={accessor}
                multiple
                disabled={readOnly}
                value={Array.isArray(formField.value) ? formField.value : []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                  formField.onChange(selected);
                }}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                {Object.entries(options).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                {...formField}
                id={accessor}
                disabled={readOnly}
                value={formField.value ?? ""}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  border: fieldState.error ? "1px solid red" : "1px solid #ccc",
                  borderRadius: "4px",
                }}
              >
                <option value="">-- Select --</option>
                {Object.entries(options).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            )}
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
SelectField.displayName = "SelectField";
