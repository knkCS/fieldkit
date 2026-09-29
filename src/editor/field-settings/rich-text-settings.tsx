// src/editor/field-settings/rich-text-settings.tsx
import { Box, chakra, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { useId, useMemo } from "react";
import { useFieldKit } from "../../renderer/provider";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { SettingsProps } from "../../schema/plugin";
import { BlueprintPicker } from "./blueprint-picker";
import { SettingLockReason, useSettingLock } from "./setting-lock";

interface ViewModeOption {
	id: NonNullable<RichTextSettings["view_mode"]>;
	label: string;
}

const VIEW_MODES: ViewModeOption[] = [
	{ id: "full", label: "Full" },
	{ id: "compact", label: "Compact" },
];

/**
 * Type-settings editor for `rich_text`: the Text Type Release its text is
 * written in (`text_type`, a Pin — ADR-0020) and how the editor shows it.
 *
 * The Text Types come from `adapters.textType.list()`, each entry's
 * `id` being the Text Type Release id the Pin stores. Without that adapter the
 * picker degrades to Release id entry, as the Fieldset's Blueprint picker
 * does, so the Field stays configurable.
 */
export function RichTextSettingsEditor({
	settings,
	field,
	onChange,
}: SettingsProps<RichTextSettings>) {
	const { adapters } = useFieldKit();
	const textType = adapters.textType;
	const viewModeLock = useSettingLock("view_mode");
	const viewModeId = useId();

	// Memoised on the adapter, so the picker's list fetch keys on something
	// stable (useBlueprintList fetches once per mount either way).
	const listTextTypes = textType?.list;
	const source = useMemo(
		() => ({
			list: listTextTypes
				? async () =>
						(await listTextTypes()).map(({ id, name }) => ({ id, name }))
				: undefined,
		}),
		[listTextTypes],
	);

	const viewMode = VIEW_MODES.find(
		(option) => option.id === (settings?.view_mode ?? "full"),
	);

	return (
		<Box>
			<BlueprintPicker
				fieldId={field?.config.api_accessor ?? "rich_text"}
				settingsKey="text_type"
				label="Text Type"
				helperText="The Text Type Release this field's rich text is written in."
				value={settings?.text_type ? [settings.text_type] : []}
				onChange={(ids) => onChange({ ...settings, text_type: ids[0] })}
				selectPlaceholder="Select a Text Type"
				idInputPlaceholder="Text Type Release id"
				idInputTestId="rich-text-text-type-input"
				source={source}
				noMatchMessage="No Text Type matches"
				noneMessage="No Text Types available"
				failureMessage="Text Type list fetch failed"
			/>

			<chakra.label
				htmlFor={viewModeId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				View mode
			</chakra.label>
			<BaseSelect<ViewModeOption>
				inputId={viewModeId}
				size="sm"
				options={VIEW_MODES}
				value={viewMode ?? null}
				disabled={viewModeLock.locked}
				onChange={(next) => {
					const picked = Array.isArray(next) ? next[0] : next;
					if (picked) onChange({ ...settings, view_mode: picked.id });
				}}
			/>
			<Text fontSize="xs" color="fg.muted" mt="1">
				How much of the editor's toolbar the field shows.
			</Text>
			<SettingLockReason lock={viewModeLock} />
		</Box>
	);
}
RichTextSettingsEditor.displayName = "RichTextSettingsEditor";
