// src/renderer/read-value.tsx
//
// One stored value rendered for reading — SpecForm's read mode, and a value
// control that has no source to fill it from (ADR-0027, amended). Beside the
// fields and the form rather than inside either, since both read through it.
import { Text } from "@chakra-ui/react";
import type { Field } from "../schema/types";
import { EmptyReadValue } from "./fields/empty-value";
import { useFieldKit } from "./provider";

function isEmpty(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		value === "" ||
		(Array.isArray(value) && value.length === 0)
	);
}

export interface ReadValueLabels {
	booleanYes: string;
	booleanNo: string;
}

/** What a boolean reads as where no labels are given — SpecForm's defaults,
 * and every reading outside SpecForm's labels (a value control with no
 * source). */
export const DEFAULT_READ_VALUE_LABELS: ReadValueLabels = {
	booleanYes: "Yes",
	booleanNo: "No",
};

/**
 * Type-aware fallback for plugins without a cellComponent: booleans and
 * primitive arrays render readably instead of raw String(value); objects
 * (and arrays containing objects) fall back to the em-dash convention —
 * a cellComponent is the API for full control over complex values.
 * Returns null for "render the em dash".
 */
function formatFallback(
	value: unknown,
	labels: ReadValueLabels,
): string | null {
	if (typeof value === "boolean") {
		return value ? labels.booleanYes : labels.booleanNo;
	}
	if (Array.isArray(value)) {
		const primitives = value.every(
			(v) =>
				typeof v === "string" ||
				typeof v === "number" ||
				typeof v === "boolean",
		);
		if (!primitives) return null;
		return value
			.map((v) =>
				typeof v === "boolean"
					? v
						? labels.booleanYes
						: labels.booleanNo
					: String(v),
			)
			.join(", ");
	}
	if (typeof value === "object") return null;
	return String(value);
}

/**
 * One Field's stored value, rendered for reading.
 *
 * Four answers, tried in order, and the order is the whole contract:
 *
 * 1. **Empty is an em dash**, before any plugin is consulted — the four ways a
 *    value is absent all read the same, whatever type it is.
 * 2. **The plugin's own `readComponent`**, when it has one. This is where a
 *    type whose reading differs from its table cell says so: a Group shows its
 *    rows where the cell counts them, a Reference Field resolves and nests
 *    where the cell counts. It is handed `ReadValue` itself as `renderChild`,
 *    so a container renders what it holds without this function knowing what
 *    that is.
 * 3. **The plugin's `cellComponent`** — the ordinary case, and the same
 *    rendering `SpecDataTable` uses.
 * 4. **A type-aware fallback**, for a plugin with neither.
 *
 * Steps 2 and 3 are why nothing here names a Field type. It used to name two
 * (`group`, `single_reference`), which ADR-0007 is the standing argument
 * against — and for reference types a name check could not work at all, since
 * a Consumer mints reference-shaped types under ids of its own (ADR-0010).
 */
export function ReadValue({
	field,
	value,
	labels,
}: {
	field: Field;
	value: unknown;
	labels: ReadValueLabels;
}) {
	const { getPlugin } = useFieldKit();
	if (isEmpty(value)) return <EmptyReadValue />;

	const plugin = getPlugin(field.field_type);

	const Read = plugin?.readComponent;
	if (Read) {
		return (
			<Read
				field={field}
				value={value}
				renderChild={(child, childValue) => (
					<ReadValue field={child} value={childValue} labels={labels} />
				)}
			/>
		);
	}

	const Cell = plugin?.cellComponent;
	if (Cell) return <Cell field={field} value={value} />;

	const formatted = formatFallback(value, labels);
	if (formatted == null) return <EmptyReadValue />;
	return <Text>{formatted}</Text>;
}
ReadValue.displayName = "ReadValue";
