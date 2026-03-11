// src/table/edit-drawer.tsx
import { useCallback, useMemo } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Schema } from "../schema/types";
import type { FieldTypePlugin } from "../schema/plugin";
import { specToZodSchema } from "../schema/zod-builder";
import { getDefaultValues } from "../schema/zod-builder";
import { FieldKitProvider } from "../renderer/provider";
import { FieldRenderer } from "../renderer/field-renderer";

export interface EditDrawerProps {
  schema: Schema;
  plugins: FieldTypePlugin[];
  initialValues?: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => void;
  title?: string;
}

export function EditDrawer({
  schema,
  plugins,
  initialValues,
  isOpen,
  onClose,
  onSave,
  title = "Edit",
}: EditDrawerProps) {
  const zodSchema = useMemo(
    () => specToZodSchema(schema, plugins),
    [schema, plugins],
  );

  const defaults = useMemo(() => {
    const specDefaults = getDefaultValues(schema);
    return { ...specDefaults, ...initialValues };
  }, [schema, initialValues]);

  const methods = useForm({
    resolver: zodResolver(zodSchema),
    defaultValues: defaults,
  });

  const handleSave = useCallback(
    (values: Record<string, unknown>) => {
      onSave(values);
    },
    [onSave],
  );

  if (!isOpen) return null;

  return (
    <div
      data-testid="edit-drawer"
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "480px",
        backgroundColor: "#fff",
        boxShadow: "-2px 0 8px rgba(0, 0, 0, 0.15)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 24px",
          borderBottom: "1px solid #e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          {title}
        </h2>
      </div>

      <FormProvider {...methods}>
        <form
          onSubmit={methods.handleSubmit(handleSave)}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
            <FieldKitProvider plugins={plugins}>
              <FieldRenderer schema={schema} />
            </FieldKitProvider>
          </div>

          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #e2e8f0",
              display: "flex",
              gap: "8px",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                border: "1px solid #e2e8f0",
                borderRadius: "6px",
                backgroundColor: "#fff",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                border: "none",
                borderRadius: "6px",
                backgroundColor: "#3182ce",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Save
            </button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
EditDrawer.displayName = "EditDrawer";
