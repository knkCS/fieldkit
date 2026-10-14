// src/editor/field-settings/fieldset-settings.tsx
import { Box, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { SettingsProps } from "../../schema/plugin";
import { BlueprintPicker, useBlueprintSource } from "./blueprint-picker";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/**
 * Type-settings editor for `fieldset`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * The Author picks the Blueprint through the shared `BlueprintPicker`,
 * searching the `blueprint` Adapter for the `fieldset` purpose (ADR-0027).
 */
export function FieldsetSettingsEditor({
	settings,
	field,
	onChange,
}: SettingsProps<FieldsetSettings>) {
	const collapsibleLock = useSettingLock("collapsible");
	const source = useBlueprintSource("fieldset");

	function handleCollapsible(e: ChangeEvent<HTMLInputElement>) {
		onChange({ ...settings, collapsible: e.target.checked });
	}

	return (
		<Box>
			<BlueprintPicker
				fieldId={field?.config.api_accessor ?? "fieldset"}
				settingsKey="blueprint"
				label="Blueprint"
				helperText="The blueprint whose fields this fieldset embeds."
				// One Blueprint, carried as an array of zero or one so the picker
				// has a single contract for both modes.
				value={settings?.blueprint ? [settings.blueprint] : []}
				onChange={(ids) => onChange({ ...settings, blueprint: ids[0] })}
				placeholder="Select a blueprint"
				testId="fieldset-blueprint"
				source={source}
			/>

			<Box as="label" display="flex" alignItems="center" gap="2">
				<input
					type="checkbox"
					checked={settings?.collapsible ?? false}
					onChange={handleCollapsible}
					disabled={collapsibleLock.locked}
					data-testid="fieldset-collapsible-input"
				/>
				<Text fontSize="sm">Collapsible</Text>
			</Box>
			<SettingLockReason lock={collapsibleLock} />
		</Box>
	);
}
FieldsetSettingsEditor.displayName = "FieldsetSettingsEditor";
