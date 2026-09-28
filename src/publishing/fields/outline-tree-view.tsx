import { Text } from "@chakra-ui/react";
import { CountCell } from "@knkcs/anker/components";
import { FormField } from "@knkcs/anker/forms";
import type { CellProps, FieldProps } from "../../schema/plugin";
import { isPlainObject } from "../../schema/unset";
import type { OutlineTreeSettings } from "../field-types/outline-tree";

/** How many nodes an outline value holds, at every level; 0 for a value that
 * is not a tree. */
export function countOutlineNodes(value: unknown): number {
	if (!Array.isArray(value)) return 0;
	let count = 0;
	for (const node of value) {
		count++;
		if (isPlainObject(node)) count += countOutlineNodes(node.children);
	}
	return count;
}

function outlineCountProps(value: unknown) {
	const count = countOutlineNodes(value);
	return {
		value: count === 0 ? null : count,
		singular: "node",
		plural: "nodes",
	} as const;
}

/**
 * `outline_tree`'s control until its editing UI is ported (#267): how many
 * nodes the outline holds, read-only. The data contract ships first
 * (ADR-0002, amended) and no built-in control edits a tree of `{_id, values,
 * children}` nodes, so a Consumer that edits outlines attaches its own
 * component by spreading the plugin (`{ ...outlineTreePlugin, fieldComponent:
 * Mine }`). The value is left exactly as loaded: this never writes it.
 */
export function OutlineTreeField({ field }: FieldProps<OutlineTreeSettings>) {
	const { config } = field;
	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly
		>
			{(formField) => {
				const count = countOutlineNodes(formField.value);
				return (
					<Text color="fg.muted">
						{count === 0
							? "No nodes"
							: `${count} ${count === 1 ? "node" : "nodes"}`}
					</Text>
				);
			}}
		</FormField>
	);
}
OutlineTreeField.displayName = "OutlineTreeField";

/** An outline at table density: how many nodes, at every level. */
export function OutlineTreeCell({ value }: CellProps<OutlineTreeSettings>) {
	return <CountCell {...outlineCountProps(value)} />;
}
OutlineTreeCell.displayName = "OutlineTreeCell";
