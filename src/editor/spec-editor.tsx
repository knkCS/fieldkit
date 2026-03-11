// src/editor/spec-editor.tsx
import { useState, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Schema, Field } from "../schema/types";
import type { FieldTypePlugin, FieldContext } from "../schema/plugin";
import { TypePicker } from "./type-picker";
import { FieldModal } from "./field-modal";
import { GripVertical, Plus, Pencil, Trash2 } from "lucide-react";

export interface SpecEditorProps {
  schema: Schema;
  onChange: (schema: Schema) => void;
  plugins: FieldTypePlugin[];
  context?: FieldContext;
}

interface SortableFieldItemProps {
  field: Field;
  plugin: FieldTypePlugin | undefined;
  onEdit: () => void;
  onRemove: () => void;
}

function SortableFieldItem({ field, plugin, onEdit, onRemove }: SortableFieldItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.config.api_accessor });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    border: "1px solid #ddd",
    borderRadius: "6px",
    background: isDragging ? "#f0f4ff" : "#fff",
    opacity: isDragging ? 0.8 : 1,
    marginBottom: "4px",
  };

  const Icon = plugin?.icon;

  return (
    <div ref={setNodeRef} style={style} data-testid={`field-item-${field.config.api_accessor}`}>
      <button
        type="button"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        style={{
          cursor: "grab",
          border: "none",
          background: "none",
          padding: "2px",
          display: "flex",
          alignItems: "center",
          color: "#999",
        }}
      >
        <GripVertical size={16} />
      </button>

      {Icon && (
        <span style={{ color: "#666", display: "flex", alignItems: "center" }}>
          <Icon size={16} />
        </span>
      )}

      <span style={{ flex: 1, fontWeight: 500, fontSize: "14px" }}>
        {field.config.name}
      </span>

      <span style={{ color: "#999", fontSize: "12px", fontFamily: "monospace" }}>
        {field.config.api_accessor}
      </span>

      <button
        type="button"
        aria-label={`Edit ${field.config.name}`}
        data-testid={`edit-field-${field.config.api_accessor}`}
        onClick={onEdit}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          color: "#666",
        }}
      >
        <Pencil size={14} />
      </button>

      <button
        type="button"
        aria-label={`Remove ${field.config.name}`}
        data-testid={`remove-field-${field.config.api_accessor}`}
        onClick={onRemove}
        style={{
          border: "none",
          background: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          color: "#e53e3e",
        }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
SortableFieldItem.displayName = "SortableFieldItem";

function SpecEditorInner({ schema, onChange, plugins, context }: SpecEditorProps) {
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [editingPlugin, setEditingPlugin] = useState<FieldTypePlugin | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const fieldIds = useMemo(
    () => schema.map((f) => f.config.api_accessor),
    [schema],
  );

  const existingAccessors = useMemo(
    () => schema.map((f) => f.config.api_accessor),
    [schema],
  );

  const pluginMap = useMemo(() => {
    const map = new Map<string, FieldTypePlugin>();
    for (const p of plugins) map.set(p.id, p);
    return map;
  }, [plugins]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = fieldIds.indexOf(active.id as string);
      const newIndex = fieldIds.indexOf(over.id as string);

      if (oldIndex !== -1 && newIndex !== -1) {
        onChange(arrayMove([...schema], oldIndex, newIndex));
      }
    },
    [schema, fieldIds, onChange],
  );

  const handleTypeSelect = useCallback(
    (pluginId: string) => {
      const plugin = pluginMap.get(pluginId);
      if (!plugin) return;

      setShowTypePicker(false);
      setEditingField(null);
      setEditingPlugin(plugin);
      setIsModalOpen(true);
    },
    [pluginMap],
  );

  const handleEdit = useCallback(
    (field: Field) => {
      const plugin = pluginMap.get(field.field_type);
      setEditingField(field);
      setEditingPlugin(plugin ?? null);
      setIsModalOpen(true);
    },
    [pluginMap],
  );

  const handleRemove = useCallback(
    (accessor: string) => {
      onChange(schema.filter((f) => f.config.api_accessor !== accessor));
    },
    [schema, onChange],
  );

  const handleModalSave = useCallback(
    (savedField: Field) => {
      if (editingField) {
        // Update existing field
        onChange(
          schema.map((f) =>
            f.config.api_accessor === editingField.config.api_accessor
              ? savedField
              : f,
          ),
        );
      } else {
        // Add new field
        onChange([...schema, savedField]);
      }

      setIsModalOpen(false);
      setEditingField(null);
      setEditingPlugin(null);
    },
    [editingField, schema, onChange],
  );

  const handleModalClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingField(null);
    setEditingPlugin(null);
  }, []);

  return (
    <div data-testid="spec-editor">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={fieldIds}
          strategy={verticalListSortingStrategy}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {schema.map((field) => (
              <SortableFieldItem
                key={field.config.api_accessor}
                field={field}
                plugin={pluginMap.get(field.field_type)}
                onEdit={() => handleEdit(field)}
                onRemove={() => handleRemove(field.config.api_accessor)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {schema.length === 0 && !showTypePicker && (
        <p style={{ color: "#888", textAlign: "center", padding: "24px", fontSize: "14px" }}>
          No fields yet. Click "Add field" to get started.
        </p>
      )}

      <div style={{ marginTop: "12px" }}>
        {showTypePicker ? (
          <div
            style={{
              border: "1px solid #ddd",
              borderRadius: "8px",
              padding: "16px",
              background: "#fafafa",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600 }}>
                Choose a field type
              </h4>
              <button
                type="button"
                onClick={() => setShowTypePicker(false)}
                style={{
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "13px",
                  color: "#666",
                }}
              >
                Cancel
              </button>
            </div>
            <TypePicker
              plugins={plugins}
              context={context}
              currentSpec={schema}
              onSelect={handleTypeSelect}
            />
          </div>
        ) : (
          <button
            type="button"
            data-testid="add-field-button"
            onClick={() => setShowTypePicker(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 16px",
              border: "1px dashed #ccc",
              borderRadius: "6px",
              background: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              color: "#555",
              width: "100%",
              justifyContent: "center",
            }}
          >
            <Plus size={16} />
            Add field
          </button>
        )}
      </div>

      <FieldModal
        field={editingField}
        plugin={editingPlugin}
        existingAccessors={existingAccessors}
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
      />
    </div>
  );
}

export const SpecEditor = SpecEditorInner;
(SpecEditor as { displayName?: string }).displayName = "SpecEditor";
