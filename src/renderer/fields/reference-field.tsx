import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { FieldProps } from "../../schema/plugin";
import type { Reference } from "../../schema/reference";
import { asReference } from "../../schema/reference";
import type { ReferenceItem } from "../adapters";
import { useResolvedContentNames } from "../hooks/use-resolved-content-names";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";
import { ReferencePickerDrawer } from "./reference-picker-drawer";

/** One rendered row: the Reference, and where it sits in the stored array. */
interface Row {
	reference: Reference;
	index: number;
}

/**
 * An ordered list of References, each row naming the Content it points at.
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
 * The list is flat here. `children` is part of the Reference shape (ADR-0008)
 * and nesting, with the drag-and-drop that goes with it, arrives later.
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

	// Read through `asReference` rather than trusting the cast: form data
	// arrives from a Consumer and is only as well-formed as whatever produced
	// it. Each row keeps the position it holds in the *stored* array, not its
	// position among the rows — otherwise a malformed entry that renders no row
	// would make every remove below act one place off.
	const rows: Row[] = useMemo(() => {
		if (!Array.isArray(value)) return [];
		return value
			.map((entry, index) => ({ reference: asReference(entry), index }))
			.filter((row): row is Row => row.reference !== null);
	}, [value]);

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
				function handleAdd(content: ReferenceItem, pin: string | null) {
					// The id, and the Pin's target id where there is one. Never a
					// display name — it would go stale the moment the Content is
					// renamed — and never which *kind* of target the Pin is: the
					// Field's `pin_mode` is the only thing that says (ADR-0008).
					//
					// No Pin means no key, rather than an explicit null: "the
					// newest Version" is what an absent Pin already means, and a
					// Field that does not pin must store exactly what it always
					// stored.
					const reference: Reference = pin
						? { id: content.id, pin }
						: { id: content.id };
					formField.onChange([...entries, reference]);
					setPicking(false);
				}

				// By stored position, so an entry that renders no row is neither
				// removed by mistake nor dropped along the way.
				function handleRemove(index: number) {
					formField.onChange(entries.filter((_, i) => i !== index));
				}

				return (
					<Box>
						{rows.length === 0 && (
							<Text fontSize="sm" color="fg.muted" fontStyle="italic">
								No references yet.
							</Text>
						)}

						{rows.map(({ reference, index }) => {
							const name = names[reference.id] ?? reference.id;
							return (
								<Flex
									// The stored position, because References are
									// positional here: the same Content may legitimately be
									// referenced twice, so an id is not an identity.
									key={index}
									align="center"
									justify="space-between"
									gap="2"
									mb="2"
									px="3"
									py="2"
									bg="bg.muted"
									borderRadius="md"
									data-testid="reference-row"
								>
									<Text fontSize="sm">{name}</Text>
									{!readOnly && (
										<IconButton
											aria-label={`Remove ${name}`}
											size="xs"
											variant="ghost"
											onClick={() => handleRemove(index)}
										>
											<Trash2 size={14} />
										</IconButton>
									)}
								</Flex>
							);
						})}

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
								// The one thing that decides whether adding is one
								// step or two.
								pinMode={settings?.pin_mode}
							/>
						)}
					</Box>
				);
			}}
		</FormField>
	);
}
ReferenceField.displayName = "ReferenceField";
