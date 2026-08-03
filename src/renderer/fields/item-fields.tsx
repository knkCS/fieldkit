import { memo, useMemo } from "react";
import type { Field } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";

interface NestedItemFieldsProps {
	childFields: Field[];
	parentAccessor: string;
	/** Position of the row this renders, for a repeating parent (group,
	 * blocks) — child accessors become `parent.index.child`. Omitted by a
	 * non-repeating parent (fieldset), whose one record nests its children
	 * directly: `parent.child`. */
	index?: number;
	readOnly?: boolean;
}

/**
 * Renders one nested field list — a repeating item's row (group, blocks) or a
 * fieldset's single record — computing the remapped schema (child
 * api_accessor rewritten to the dotted path under `parentAccessor`) in a
 * useMemo keyed on the stable inputs. This keeps the schema array reference
 * stable across re-renders of the parent field that don't affect this
 * particular item, which is required for FieldComponent's identity-based memo
 * (see field-component.tsx) to actually skip re-rendering.
 */
function NestedItemFieldsInner({
	childFields,
	parentAccessor,
	index,
	readOnly,
}: NestedItemFieldsProps) {
	const schema = useMemo(() => {
		const prefix =
			index === undefined ? parentAccessor : `${parentAccessor}.${index}`;
		return childFields.map((child) => ({
			...child,
			config: {
				...child.config,
				api_accessor: `${prefix}.${child.config.api_accessor}`,
			},
		}));
	}, [childFields, parentAccessor, index]);

	return <FieldRenderer schema={schema} readOnly={readOnly} />;
}

export const NestedItemFields = memo(NestedItemFieldsInner);
NestedItemFields.displayName = "NestedItemFields";
