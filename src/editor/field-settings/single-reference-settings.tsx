// src/editor/field-settings/single-reference-settings.tsx
import { Stack } from "@chakra-ui/react";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { SettingsProps } from "../../schema/plugin";
import { PinModePicker } from "./pin-mode-picker";
import { ReferenceBlueprintsEditor } from "./reference-blueprints-editor";
import { ReferenceSpecEditor } from "./reference-spec-editor";

/**
 * Type-settings editor for `single_reference`, mounted by the config panel's
 * Type settings tab. It lives in the editor layer for the same reason a
 * plugin's field component lives in the renderer and its cell in the table:
 * `/schema` carries no React of its own (CLAUDE.md, Architecture).
 *
 * No Blueprints at all is a legitimate setting: fieldkit has no notion of a
 * Blueprint kind (ADR-0002), so an unconstrained Field simply lets the
 * Adapter decide what may be referenced.
 */
export function SingleReferenceSettingsEditor({
	settings,
	field,
	onChange,
	onDrillIn,
	plugins,
}: SettingsProps<SingleReferenceSettings>) {
	return (
		<Stack gap="4">
			<ReferenceBlueprintsEditor
				fieldId={field?.config.api_accessor ?? "single_reference"}
				value={settings?.blueprints}
				onChange={(blueprints) => onChange({ ...settings, blueprints })}
				idInputTestId="single-reference-blueprints-input"
			/>
			<PinModePicker
				settingsKey="pin_mode"
				label="Pin the reference to"
				value={settings?.pin_mode ?? "none"}
				onChange={(pin_mode) => onChange({ ...settings, pin_mode })}
			/>
			<ReferenceSpecEditor
				referenceSpec={settings?.spec ?? []}
				onChange={(spec) => onChange({ ...settings, spec })}
				plugins={plugins}
				onDrillIn={onDrillIn}
			/>
		</Stack>
	);
}
SingleReferenceSettingsEditor.displayName = "SingleReferenceSettingsEditor";
