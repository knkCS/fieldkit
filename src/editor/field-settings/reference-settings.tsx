// src/editor/field-settings/reference-settings.tsx
import { Stack } from "@chakra-ui/react";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { SettingsProps } from "../../schema/plugin";
import { AttributeSpecEditor } from "./attribute-spec-editor";
import { BlueprintPicker } from "./blueprint-picker";
import { CapInput } from "./cap-input";
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
	/**
	 * Writes a cap, or takes the key out altogether when it is cleared.
	 *
	 * Deleting rather than writing `undefined` is what keeps "no cap" and "a cap
	 * of zero" apart all the way into stored JSON, where `undefined` does not
	 * survive. It is the same shape the panel's validation tab uses for its own
	 * numeric settings.
	 */
	function commitCap(key: "max_items" | "max_depth", cap: number | undefined) {
		const next = { ...settings };
		if (cap === undefined) delete next[key];
		else next[key] = cap;
		onChange(next);
	}

	return (
		<Stack gap="4">
			<BlueprintPicker
				fieldId={field?.config.api_accessor ?? "reference"}
				settingsKey="blueprints"
				label="Blueprints"
				helperText="The blueprints this field may point at. Leave empty to allow any."
				multiple
				value={settings?.blueprints ?? []}
				onChange={(blueprints) => onChange({ ...settings, blueprints })}
				selectPlaceholder="Any blueprint"
				idInputPlaceholder="Blueprint ids, comma separated"
				idInputTestId="reference-blueprints-input"
			/>
			<CapInput
				settingsKey="max_items"
				label="Maximum references"
				helperText="Counts every reference, nested ones included. Leave empty for no limit."
				value={settings?.max_items}
				// Zero is authorable here — "this Field holds no References" is a
				// coherent thing to say, and the Schema enforces it. Zero *levels*
				// is not, which is why the depth box floors at one.
				min={0}
				placeholder="No limit"
				onChange={(cap) => commitCap("max_items", cap)}
				testId="reference-max-items-input"
			/>
			<CapInput
				settingsKey="max_depth"
				label="Maximum depth"
				// `max_depth` counts levels, not the index of the deepest one —
				// saying so here is the difference between a flat list and one
				// level of nesting.
				helperText="How many levels of references the tree may hold. 1 is a flat list; 2 allows one level of nesting. Leave empty for no limit."
				value={settings?.max_depth}
				// One, not zero: `max_depth: 0` allows no References at all, which
				// no Author means to say. `referenceDepthCeiling` still reads it
				// honestly if a Spec arrives carrying one — a cap fieldkit refuses
				// to author is not a cap it may quietly ignore.
				min={1}
				placeholder="No limit"
				onChange={(cap) => commitCap("max_depth", cap)}
				testId="reference-max-depth-input"
			/>
			<PinModePicker
				settingsKey="pin_mode"
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
