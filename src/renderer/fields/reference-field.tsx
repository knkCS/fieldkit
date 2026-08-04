import { Box, Button, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { get, useFormState, useWatch } from "react-hook-form";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import {
	referenceDepthCeiling,
	referenceItemCap,
} from "../../schema/field-types/reference";
import type { FieldProps } from "../../schema/plugin";
import { withPin } from "../../schema/reference";
import { readReferenceTree } from "../../schema/reference-tree";
import type { ReferenceItem } from "../adapters";
import { useResolvedContentNames } from "../hooks/use-resolved-content-names";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";
import { ReferenceAttributesDrawer } from "./reference-attributes-drawer";
import { ReferencePickerDrawer } from "./reference-picker-drawer";
import { ReferenceTree } from "./reference-tree";

/**
 * Every message reported *under* a Field's own error node, deduplicated.
 *
 * The Schema reports an over-deep Reference at that Reference's path —
 * `related.0.children.1` — which is what makes the report precise, and also
 * what puts it out of `FormField`'s reach: `FormField` renders the message on
 * the Field's node, and a nested report leaves none there. Collecting them is
 * the difference between a blocked submit and a submit that looks like nothing
 * happened. The paths themselves stay in `formState.errors` for a Consumer that
 * wants to point at rows.
 *
 * One message repeated once per offending branch says nothing the first said,
 * so the same text is shown once.
 *
 * It collects *every* nested message, not only the depth cap's — a required
 * Attribute reports at `related.0.attributes.page` and is out of reach for the
 * same reason. That is deliberate: an Attribute lives inside a drawer, so
 * without this a submit blocked by one is a submit blocked by nothing visible
 * at all. Which Reference each message came from is still only in
 * `formState.errors`; naming it on the row is a row's job, not this one's.
 */
function nestedErrorMessages(error: unknown): string[] {
	const found = new Set<string>();
	const walk = (node: object) => {
		for (const [key, value] of Object.entries(node)) {
			// A node's own report, and the DOM node it points at — everything
			// else is a branch below it.
			if (key === "message" || key === "type" || key === "ref") continue;
			if (typeof value !== "object" || value === null) continue;
			const message = (value as { message?: unknown }).message;
			if (typeof message === "string" && message.length > 0) found.add(message);
			walk(value);
		}
	};
	if (typeof error === "object" && error !== null) walk(error);
	return [...found];
}

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
	// Which Reference's Attributes are open, by where it sits in the stored
	// value — never the row object, which is rebuilt on every keystroke inside
	// the drawer. The name is carried along because it is the drawer's title
	// and resolving it again would be a second chance to disagree.
	const [filling, setFilling] = useState<{
		path: number[];
		name: string;
	} | null>(null);

	// A Consumer's settings object is a fresh literal on every render, and the
	// drawer's search effect must not churn with it.
	const blueprints = useStableValue(settings?.blueprints ?? []);

	// The Attribute Spec, on the same terms: `NestedItemFields` memoizes the
	// remapped Spec by identity, so a fresh array per render would defeat it.
	const attributeSpec = useStableValue(settings?.attributes ?? []);

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

	// The Schema is the truth about both caps; these two only stop an Author
	// reaching a limit the Schema would then report. `rows` is the same reading
	// of the value the Schema counts — every Reference at every level — so the
	// affordance and the Schema cannot disagree about how full the tree is.
	// Read through `referenceItemCap`, never `?? 0`: an unset cap is no cap.
	const itemCap = referenceItemCap(settings);
	const atCap = itemCap !== undefined && rows.length >= itemCap;

	// A depth *index*, converted from the `max_depth` count once, where the
	// setting is defined. The tree clamps a drop to it; the Schema reports
	// anything already past it.
	const depthCeiling = referenceDepthCeiling(settings);

	const { errors } = useFormState({ name: accessor });
	const deepErrors = nestedErrorMessages(get(errors, accessor));

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
				function handleAdd(content: ReferenceItem, pin: string | null) {
					// The id, and the Pin's target id where there is one. Never a
					// display name — it would go stale the moment the Content is
					// renamed — and never which *kind* of target the Pin is: the
					// Field's `pin_mode` is the only thing that says (ADR-0008).
					// `withPin` is what keeps "no Pin means no key" written down
					// once, for both Reference Field types.
					formField.onChange([...entries, withPin(null, content.id, pin)]);
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
							depthCeiling={depthCeiling}
							attributeSpec={attributeSpec}
							onOpenAttributes={(row) =>
								setFilling({
									path: row.path,
									name: names[row.reference.id] ?? row.reference.id,
								})
							}
						/>

						{/* Reported here rather than on the Field, because that is
						    where the Schema put them — see nestedErrorMessages. */}
						{deepErrors.map((message) => (
							<Text
								key={message}
								role="alert"
								fontSize="sm"
								color="fg.error"
								mt="1"
							>
								{message}
							</Text>
						))}

						{!readOnly && (
							<Button
								size="sm"
								variant="outline"
								mt="1"
								// Disabled rather than hidden: an Author at the cap
								// should see that adding is the thing that stopped
								// being possible.
								disabled={atCap}
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
								// The one thing that decides whether adding is one
								// step or two.
								pinMode={settings?.pin_mode}
							/>
						)}

						{filling && (
							// Keyed by the path, so switching Reference mounts a fresh
							// drawer rather than one still registered under the last
							// Reference's Attributes.
							<ReferenceAttributesDrawer
								key={filling.path.join(".")}
								open
								onClose={() => setFilling(null)}
								attributeSpec={attributeSpec}
								accessor={accessor}
								path={filling.path}
								name={filling.name}
								readOnly={readOnly}
							/>
						)}
					</Box>
				);
			}}
		</FormField>
	);
}
ReferenceField.displayName = "ReferenceField";
