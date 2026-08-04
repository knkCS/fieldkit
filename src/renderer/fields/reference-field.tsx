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
	const maxItems = settings?.max_items;

	const [picking, setPicking] = useState(false);

	// Serialized, not the array itself: a Consumer's settings object is a fresh
	// literal on every render, and effect deps must not churn with it.
	const blueprintsKey = JSON.stringify(settings?.blueprints ?? []);
	const blueprints = useMemo(
		() => JSON.parse(blueprintsKey) as string[],
		[blueprintsKey],
	);

	// Read through `asReference` rather than trusting the cast: form data
	// arrives from a Consumer and is only as well-formed as whatever produced
	// it. Each row keeps the position it holds in the *stored* array, not its
	// position among the rows — otherwise a malformed entry that renders no row
	// would make every remove below act one place off.
	const value = useWatch({ name: accessor });
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

	const atCap = maxItems !== undefined && rows.length >= maxItems;

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(formField) => {
				const stored: Reference[] = Array.isArray(formField.value)
					? formField.value
					: [];

				function handleAdd(content: ReferenceItem) {
					// The id and nothing else. A display name in stored data would
					// go stale the moment the Content is renamed.
					formField.onChange([...stored, { id: content.id }]);
					setPicking(false);
				}

				function handleRemove(index: number) {
					formField.onChange(stored.filter((_, i) => i !== index));
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
								// At the cap there is nothing to add, and the Schema
								// would reject the result anyway — better to stop
								// offering than to let a submit fail.
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
							/>
						)}
					</Box>
				);
			}}
		</FormField>
	);
}
ReferenceField.displayName = "ReferenceField";
