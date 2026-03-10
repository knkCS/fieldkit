// src/renderer/field-component.tsx
import { memo } from "react";
import type { Field } from "../schema/types";
import { useFieldKit } from "./provider";

export interface FieldComponentProps {
  field: Field;
  readOnly?: boolean;
}

function FieldComponentInner({ field, readOnly }: FieldComponentProps) {
  const { getPlugin } = useFieldKit();

  if (field.config.hidden) return null;

  const plugin = getPlugin(field.field_type);

  if (!plugin) {
    return (
      <div role="alert" style={{ color: "red", padding: "8px", border: "1px solid red", borderRadius: "4px" }}>
        Unknown field type: <code>{field.field_type}</code>
      </div>
    );
  }

  const Component = plugin.fieldComponent;

  return <Component field={field} readOnly={readOnly || field.config.read_only} />;
}

export const FieldComponent = memo(FieldComponentInner, (prev, next) => {
  return (
    prev.field.config.api_accessor === next.field.config.api_accessor &&
    prev.field.field_type === next.field.field_type &&
    prev.readOnly === next.readOnly
  );
});
(FieldComponent as { displayName?: string }).displayName = "FieldComponent";
