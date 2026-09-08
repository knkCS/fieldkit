// src/editor/field-settings/lookup-settings.tsx
import { Box, Input, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { LookupSettings } from "../../schema/field-types/lookup";
import type { SettingsProps } from "../../schema/plugin";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/**
 * Type-settings editor for `lookup`: which Source the Field points into.
 *
 * **A free-text id, not a picker.** Fieldkit cannot enumerate the Sources — a
 * Consumer registers them as a record on `adapters.lookup`, and there is no
 * adapter method that lists them. Offering a select here would mean inventing
 * one, which is a capability this ticket has no reason to add; the Author types
 * the id their Consumer documents.
 *
 * Styled to match `list-settings.tsx` — the panel's other single-input settings
 * editor — rather than introducing a second look for one field type.
 */
export function LookupSettingsEditor({
	settings,
	onChange,
}: SettingsProps<LookupSettings>) {
	const lock = useSettingLock("source");
	const source = settings?.source ?? "";

	function handleSource(e: ChangeEvent<HTMLInputElement>) {
		onChange({ ...settings, source: e.target.value });
	}

	return (
		<Box>
			{/* The helper sits outside the <label> on purpose: a label wraps its
			    descendants into the input's accessible name, and the sentence
			    below is not a name. */}
			<Box as="label" display="block">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Source
				</Text>
				<Input
					size="sm"
					mt="1"
					value={source}
					onChange={handleSource}
					placeholder="layout:stylesheet"
					disabled={lock.locked}
					data-testid="lookup-source-input"
				/>
			</Box>
			<Text fontSize="xs" color="fg.muted" mt="1">
				The id this application registered the source under.
			</Text>
			<SettingLockReason lock={lock} />
		</Box>
	);
}
LookupSettingsEditor.displayName = "LookupSettingsEditor";
