import { memo, useMemo } from "react";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";

interface NestedItemFieldsProps {
	childFields: Field[];
	parentAccessor: string;
	index: number;
	readOnly?: boolean;
}

/**
 * Renders one repeating item's (group or blocks) nested fields, computing the
 * remapped schema (child api_accessor rewritten to
 * `${parentAccessor}.${index}.${...}`) in a useMemo keyed on the stable
 * inputs. This keeps the schema array reference stable across re-renders of
 * the parent field that don't affect this particular item, which is required
 * for FieldComponent's identity-based memo (see field-component.tsx) to
 * actually skip re-rendering.
 */
function NestedItemFieldsInner({
	childFields,
	parentAccessor,
	index,
	readOnly,
}: NestedItemFieldsProps) {
	const schema = useMemo(
		() =>
			childFields.map((child) => ({
				...child,
				config: {
					...child.config,
					api_accessor: `${parentAccessor}.${index}.${child.config.api_accessor}`,
				},
			})),
		[childFields, parentAccessor, index],
	);

	return <FieldRenderer schema={schema} readOnly={readOnly} />;
}

export const NestedItemFields = memo(NestedItemFieldsInner);
NestedItemFields.displayName = "NestedItemFields";
