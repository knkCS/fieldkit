// src/editor/field-settings/reference-settings.tsx
import { Stack } from "@chakra-ui/react";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { SettingsProps } from "../../schema/plugin";
import { AttributeSpecEditor } from "./attribute-spec-editor";
import { BlueprintPicker } from "./blueprint-picker";
import { PinModePicker } from "./pin-mode-picker";

/**
 * Type-settings editor for `reference`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * No Blueprints at all is a legitimate setting: fieldkit has no notion of a
 * Blueprint kind (ADR-0002), so an unconstrained Field simply lets the Adapter
 * decide what may be referenced.
 */
export function ReferenceSettingsEditor({
	settings,
	field,
	onChange,
	onDrillIn,
	plugins,
}: SettingsProps<ReferenceSettings>) {
	return (
		<Stack gap="4">
			<BlueprintPicker
				fieldId={field?.config.api_accessor ?? "reference"}
				label="Blueprints"
				helperText="The blueprints this field may point at. Leave empty to allow any."
				multiple
				value={settings?.blueprints ?? []}
				onChange={(blueprints) => onChange({ ...settings, blueprints })}
				selectPlaceholder="Any blueprint"
				idInputPlaceholder="Blueprint ids, comma separated"
				idInputTestId="reference-blueprints-input"
			/>
			<PinModePicker
				label="Pin references to"
				// Absent reads as not pinning, so a Spec authored before pinning
				// existed shows the mode it actually behaves as.
				value={settings?.pin_mode ?? "none"}
				onChange={(pin_mode) => onChange({ ...settings, pin_mode })}
			/>
			<AttributeSpecEditor
				attributeSpec={settings?.attributes ?? []}
				onChange={(attributes) => onChange({ ...settings, attributes })}
				plugins={plugins}
				onDrillIn={onDrillIn}
			/>
		</Stack>
	);
}
ReferenceSettingsEditor.displayName = "ReferenceSettingsEditor";
