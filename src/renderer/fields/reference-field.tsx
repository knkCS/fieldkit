import { Box, Button, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { FieldProps } from "../../schema/plugin";
import { readReferenceTree } from "../../schema/reference-tree";
import type { ReferenceItem } from "../adapters";
import { useResolvedContentNames } from "../hooks/use-resolved-content-names";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";
import { ReferencePickerDrawer } from "./reference-picker-drawer";
import { ReferenceTree } from "./reference-tree";

/**
 * A Reference Tree, each row naming the Content it points at.
 *
 * Two things this control deliberately does not do:
 *
 * - **It never stores a name.** A row writes `{ id }` and nothing else; the
 *   name on screen is resolved through the Adapter on every load, so a Content
 *   renamed elsewhere reads correctly here and a Content that no longer
 *   resolves keeps its id on screen rather than vanishing.
 * - **It never browses the catalogue itself.** Adding opens a drawer, because
 *   finding one Content among thousands is a browse — a table with search,
 *   filters, pages and a total — not a dropdown.
 *
 * The rows, the dragging and the collapsing all live in {@link ReferenceTree};
 * what stays here is the Field around them — the label, the Adapter, and the
 * drawer that adds to the tree.
 */
export function ReferenceField({
	field,
	readOnly,
}: FieldProps<ReferenceSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const adapter = adapters.reference;

	const [picking, setPicking] = useState(false);

	// A Consumer's settings object is a fresh literal on every render, and the
	// drawer's search effect must not churn with it.
	const blueprints = useStableValue(settings?.blueprints ?? []);

	// One read of the stored value, used both to render and to mutate: two
	// reads of the same array is two chances for them to disagree.
	const value = useWatch({ name: accessor });
	const entries: unknown[] = Array.isArray(value) ? value : [];

	// Read rather than cast: form data arrives from a Consumer and is only as
	// well-formed as whatever produced it. Each row remembers where in the
	// *stored* value it came from, so a malformed entry that renders no row
	// cannot make a remove act one place off.
	const rows = useMemo(() => readReferenceTree(value), [value]);

	const names = useResolvedContentNames(
		rows.map((row) => row.reference.id),
		accessor,
	);

	if (!adapter) {
		return (
			<FormField
				name={accessor}
				label={config.name}
				helperText={config.instructions || undefined}
				required={config.required}
				readOnly={readOnly}
			>
				{() => (
					<Text color="fg.muted" fontSize="sm">
						Reference adapter not configured
					</Text>
				)}
			</FormField>
		);
	}

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(formField) => {
				function handleAdd(content: ReferenceItem) {
					// The id and nothing else. A display name in stored data would
					// go stale the moment the Content is renamed.
					formField.onChange([...entries, { id: content.id }]);
					setPicking(false);
				}

				return (
					<Box>
						{rows.length === 0 && (
							<Text fontSize="sm" color="fg.muted" fontStyle="italic">
								No references yet.
							</Text>
						)}

						<ReferenceTree
							rows={rows}
							value={entries}
							names={names}
							readOnly={readOnly}
							onChange={formField.onChange}
						/>

						{!readOnly && (
							<Button
								size="sm"
								variant="outline"
								mt="1"
								onClick={() => setPicking(true)}
							>
								<Plus size={14} />
								Add reference
							</Button>
						)}

						{!readOnly && (
							<ReferencePickerDrawer
								open={picking}
								onClose={() => setPicking(false)}
								onPick={handleAdd}
								blueprintIds={blueprints}
								fieldId={accessor}
							/>
						)}
					</Box>
				);
			}}
		</FormField>
	);
}
ReferenceField.displayName = "ReferenceField";
