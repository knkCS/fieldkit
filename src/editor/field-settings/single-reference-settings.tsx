// src/editor/field-settings/single-reference-settings.tsx
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { SettingsProps } from "../../schema/plugin";
import { BlueprintPicker } from "./blueprint-picker";

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
}: SettingsProps<SingleReferenceSettings>) {
	return (
		<BlueprintPicker
			fieldId={field?.config.api_accessor ?? "single_reference"}
			label="Blueprints"
			helperText="The blueprints this field may point at. Leave empty to allow any."
			multiple
			value={settings?.blueprints ?? []}
			onChange={(blueprints) => onChange({ ...settings, blueprints })}
			selectPlaceholder="Any blueprint"
			idInputPlaceholder="Blueprint ids, comma separated"
			idInputTestId="single-reference-blueprints-input"
		/>
	);
}
SingleReferenceSettingsEditor.displayName = "SingleReferenceSettingsEditor";
