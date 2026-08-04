// src/editor/field-settings/attribute-spec-editor.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { Trash2 } from "lucide-react";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { createField } from "../draft-ops";
import { TypePickerPopover } from "../type-picker-popover";

/** The settings key the Attribute Spec lives under, and the one the drill-in
 * is asked for. One constant so the reader and the writer cannot drift. */
export const ATTRIBUTES_SETTINGS_KEY = "attributes";

export interface AttributeSpecEditorProps {
	/** The Attribute Spec as it stands. */
	attributes: Field[];
	/** Hands the whole list back; the caller writes it into settings. */
	onChange: (attributes: Field[]) => void;
	/** Every registered field type. Absent — a settings editor mounted outside
	 * the config panel — means no type picker: nothing can be added, but what
	 * is already declared still reads. */
	plugins?: FieldTypePlugin[];
	/** Opens the panel's drill-in on one Attribute. Absent on the same terms as
	 * `plugins`, and then an Attribute cannot be configured from here. */
	onDrillIn?: (settingsKey: string, accessor: string) => void;
}

/**
 * The Attribute Spec, authored in the Type settings tab.
 *
 * There is deliberately **no nested editor here**. Adding an Attribute is the
 * ordinary type picker, restricted to the `attribute` Field Context; configuring
 * one is the config panel's incumbent drill-in — the same Back button, the same
 * three tabs, the same Accessor gate a Group's child gets. What this component
 * owns is only the list: which Attributes exist, in what order, and how to reach
 * each one.
 *
 * The type picker offers strictly less than the canvas does — no Markers, no
 * containers, no reference types — and that narrowing lives in each plugin's
 * `availableIn`, not here. See `FieldContext`.
 */
export function AttributeSpecEditor({
	attributes,
	onChange,
	plugins,
	onDrillIn,
}: AttributeSpecEditorProps) {
	function addAttribute(pluginId: string) {
		const plugin = plugins?.find((p) => p.id === pluginId);
		if (!plugin) return;
		// Seeded against the Attributes already declared, so the generated
		// Accessor is unique among its own siblings — nothing shared checks
		// that here (ADR-0007), which is exactly why it must not be left to
		// chance.
		const created = createField(plugin, attributes);
		onChange([...attributes, created]);
		// Straight into the drill-in: a fresh Attribute is named "Number" with
		// a generated Accessor, and neither is what the Author meant.
		onDrillIn?.(ATTRIBUTES_SETTINGS_KEY, created.config.api_accessor);
	}

	function removeAttribute(accessor: string) {
		onChange(attributes.filter((a) => a.config.api_accessor !== accessor));
	}

	return (
		<Box data-testid="attribute-spec-editor">
			<Flex align="center" justify="space-between" mb="1">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Attributes
				</Text>
				{plugins && (
					<TypePickerPopover
						plugins={plugins}
						// The one thing that keeps a Marker, a container or a
						// Reference Field out of an Attribute drawer.
						context="attribute"
						currentSpec={attributes}
						onPick={addAttribute}
						triggerLabel="Add attribute"
					/>
				)}
			</Flex>

			{attributes.length === 0 ? (
				<Text fontSize="xs" color="fg.muted">
					No attributes. Every reference carries the same ones.
				</Text>
			) : (
				attributes.map((attribute) => (
					<Flex
						key={attribute.config.api_accessor}
						align="center"
						justify="space-between"
						gap="1"
						py="1"
						data-testid={`attribute-row-${attribute.config.api_accessor}`}
					>
						<Box minWidth="0">
							<Text fontSize="sm">
								{attribute.config.name}
								{attribute.config.required && " *"}
							</Text>
							<Text fontSize="xs" color="fg.muted">
								{attribute.field_type}
							</Text>
						</Box>
						<Flex align="center" gap="1">
							<Button
								size="xs"
								variant="ghost"
								onClick={() =>
									onDrillIn?.(
										ATTRIBUTES_SETTINGS_KEY,
										attribute.config.api_accessor,
									)
								}
								disabled={!onDrillIn}
								data-testid={`attribute-edit-${attribute.config.api_accessor}`}
							>
								Edit
							</Button>
							<IconButton
								aria-label={`Remove ${attribute.config.name}`}
								size="xs"
								variant="ghost"
								onClick={() => removeAttribute(attribute.config.api_accessor)}
							>
								<Trash2 size={14} />
							</IconButton>
						</Flex>
					</Flex>
				))
			)}
		</Box>
	);
}
AttributeSpecEditor.displayName = "AttributeSpecEditor";
