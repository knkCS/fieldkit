// src/renderer/field-renderer.tsx
import { memo } from "react";
import type { Schema } from "../schema/types";
import { FieldComponent } from "./field-component";

export interface FieldRendererProps {
  schema: Schema;
  readOnly?: boolean;
  loading?: boolean;
  values?: Record<string, unknown>;
}

function FieldRendererInner({ schema, readOnly, loading }: FieldRendererProps) {
  if (loading) {
    return <div data-testid="field-renderer-loading">Loading...</div>;
  }

  return (
    <div data-testid="field-renderer">
      {schema.map((field) => (
        <FieldComponent
          key={field.config.api_accessor}
          field={field}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}

export const FieldRenderer = memo(FieldRendererInner);
(FieldRenderer as { displayName?: string }).displayName = "FieldRenderer";
