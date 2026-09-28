// src/editor/field-settings/reference-spec-editor.tsx
import { Box, Flex, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { Trash2 } from "lucide-react";
import type { FieldTypePlugin } from "../../schema/plugin";
import { referenceSpecFields } from "../../schema/reference-spec";
import type { Field } from "../../schema/types";
import { createField } from "../draft-ops";
import { TypePickerPopover } from "../type-picker-popover";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/** The settings key the embedded Reference Spec lives under, and the one the
 * drill-in is asked for. One constant so the reader and the writer cannot
 * drift. */
export const REFERENCE_SPEC_SETTINGS_KEY = "spec";

export interface ReferenceSpecEditorProps {
	/** The embedded Reference Spec as it stands. */
	referenceSpec: Field[];
	/** Hands the whole list back; the caller writes it into settings. */
	onChange: (spec: Field[]) => void;
	/** Every registered field type. Absent — a settings editor mounted outside
	 * the config panel — means no type picker: nothing can be added, but what
	 * is already declared still reads. */
	plugins?: FieldTypePlugin[];
	/** Opens the panel's drill-in on one of its Fields. Absent on the same
	 * terms as `plugins`, and then a Field cannot be configured from here. */
	onDrillIn?: (settingsKey: string, accessor: string) => void;
}

/**
 * The embedded Reference Spec, authored in the Type settings tab: the Fields
 * every Reference fills in about the pointing — unless a linked Reference Spec
 * replaces it for the target's Blueprint (ADR-0008, amended).
 *
 * There is deliberately **no nested editor here**. Adding a Field is the
 * ordinary type picker, restricted to the `reference_spec` Position;
 * configuring one is the config panel's incumbent drill-in — the same Back
 * button, the same three tabs, the same Accessor gate a Group's child gets.
 * What this component owns is only the list: which Fields exist, in what order,
 * and how to reach each one.
 *
 * The type picker offers strictly less than the canvas does — no Markers, no
 * containers, no reference types — and that narrowing lives in each plugin's
 * `positions`, not here, where `validateSpec()` enforces it too. See
 * `Position`.
 */
export function ReferenceSpecEditor({
	referenceSpec,
	onChange,
	plugins,
	onDrillIn,
}: ReferenceSpecEditorProps) {
	// The Reference Spec is one settings key like any other, so freezing it
	// freezes the whole list — adding, removing and configuring a Field all
	// write `settings.spec` (ADR-0011). Drilling in is disabled with the rest:
	// the panel refuses the write anyway, and an Edit button that opens an
	// editor whose every change is silently dropped is worse than none.
	const lock = useSettingLock(REFERENCE_SPEC_SETTINGS_KEY);

	// A hand-written Spec may hold anything, so a stray entry costs itself and
	// not the panel. It is also what gets written back on an edit — an entry
	// nobody can see or reach is not one the editor should keep carrying.
	const declared = referenceSpecFields(referenceSpec);

	function addField(pluginId: string) {
		const plugin = plugins?.find((p) => p.id === pluginId);
		if (!plugin) return;
		// Seeded against the Fields already declared, so the generated Accessor
		// is unique among its own siblings.
		const created = createField(plugin, declared);
		onChange([...declared, created]);
		// Straight into the drill-in: a fresh Field is named "Number" with a
		// generated Accessor, and neither is what the Author meant.
		onDrillIn?.(REFERENCE_SPEC_SETTINGS_KEY, created.config.api_accessor);
	}

	function removeField(accessor: string) {
		onChange(declared.filter((f) => f.config.api_accessor !== accessor));
	}

	return (
		<Box data-testid="reference-spec-editor">
			<Flex align="center" justify="space-between" mb="1">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Reference Spec
				</Text>
				{plugins && (
					<TypePickerPopover
						plugins={plugins}
						// The one thing that keeps a Marker, a container or a
						// Reference Field out of a Reference's drawer.
						position="reference_spec"
						currentSpec={declared}
						onPick={addField}
						triggerLabel="Add field"
						disabled={lock.locked}
					/>
				)}
			</Flex>

			<SettingLockReason lock={lock} />

			{declared.length === 0 ? (
				<Text fontSize="xs" color="fg.muted">
					No fields. A reference carries nothing about the pointing.
				</Text>
			) : (
				declared.map((specField) => (
					<Flex
						key={specField.config.api_accessor}
						align="center"
						justify="space-between"
						gap="1"
						py="1"
						data-testid={`reference-spec-row-${specField.config.api_accessor}`}
					>
						<Box minWidth="0">
							<Text fontSize="sm">
								{specField.config.name}
								{specField.config.required && " *"}
							</Text>
							<Text fontSize="xs" color="fg.muted">
								{specField.field_type}
							</Text>
						</Box>
						<Flex align="center" gap="1">
							<Button
								size="xs"
								variant="ghost"
								onClick={() =>
									onDrillIn?.(
										REFERENCE_SPEC_SETTINGS_KEY,
										specField.config.api_accessor,
									)
								}
								disabled={!onDrillIn || lock.locked}
								data-testid={`reference-spec-edit-${specField.config.api_accessor}`}
							>
								Edit
							</Button>
							<IconButton
								aria-label={`Remove ${specField.config.name}`}
								size="xs"
								variant="ghost"
								onClick={() => removeField(specField.config.api_accessor)}
								disabled={lock.locked}
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
ReferenceSpecEditor.displayName = "ReferenceSpecEditor";
