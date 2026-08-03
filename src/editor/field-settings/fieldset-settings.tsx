// src/editor/field-settings/fieldset-settings.tsx
import { Box, Input, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { SettingsProps } from "../../schema/plugin";

/**
 * Type-settings editor for `fieldset`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * The blueprint is entered by id. The adapter cannot enumerate the
 * blueprints an Author may choose from — that capability, and the picker it
 * feeds, is #52; id entry is the degrade path that ticket keeps.
 */
export function FieldsetSettingsEditor({
	settings,
	onChange,
}: SettingsProps<FieldsetSettings>) {
	function handleBlueprint(e: ChangeEvent<HTMLInputElement>) {
		const blueprint = e.target.value.trim();
		onChange({ ...settings, blueprint: blueprint || undefined });
	}

	function handleCollapsible(e: ChangeEvent<HTMLInputElement>) {
		onChange({ ...settings, collapsible: e.target.checked });
	}

	return (
		<Box>
			{/* The helper sits outside the <label> on purpose: a label wraps its
			    descendants into the input's accessible name (see
			    list-settings.tsx). */}
			<Box as="label" display="block">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Blueprint
				</Text>
				<Input
					size="sm"
					mt="1"
					value={settings?.blueprint ?? ""}
					onChange={handleBlueprint}
					placeholder="Blueprint id"
					data-testid="fieldset-blueprint-input"
				/>
			</Box>
			<Text fontSize="xs" color="fg.muted" mt="1" mb="3">
				The blueprint whose fields this fieldset embeds.
			</Text>

			<Box as="label" display="flex" alignItems="center" gap="2">
				<input
					type="checkbox"
					checked={settings?.collapsible ?? false}
					onChange={handleCollapsible}
					data-testid="fieldset-collapsible-input"
				/>
				<Text fontSize="sm">Collapsible</Text>
			</Box>
		</Box>
	);
}
FieldsetSettingsEditor.displayName = "FieldsetSettingsEditor";
