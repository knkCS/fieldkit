// src/editor/field-settings/rich-text-settings.tsx
import { Box, chakra, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { useId } from "react";
import { useFieldKit } from "../../renderer/provider";
import { hasAdapterCapability } from "../../schema/adapter-capabilities";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { SettingsProps } from "../../schema/plugin";
import { BlueprintPicker, type PickerSource } from "./blueprint-picker";
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
 * The Text Types are searched and paged through `adapters.textType.search()`,
 * each item's `id` being the Text Type Release id the Pin stores, and stored
 * ones named through its `resolve()` — the same picker, and the same states,
 * as the Blueprint settings (ADR-0027). Without `search` the setting says the
 * application has no source for Text Types; there is no id entry.
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

	// Called on the adapter rather than plucked off it, as the Blueprint
	// source is: a Consumer may implement these as methods needing `this`.
	// The type picker's test for "can serve", so the setting shows "no
	// source" exactly where the type would have been hidden.
	const source: PickerSource | undefined =
		textType && hasAdapterCapability(adapters, "textType.search")
			? {
					search: async (query) =>
						(await textType.search?.(query)) ?? { items: [] },
					resolve: textType.resolve
						? async (query) => (await textType.resolve?.(query)) ?? []
						: undefined,
				}
			: undefined;

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
				placeholder="Select a Text Type"
				testId="rich-text-text-type"
				source={source}
				emptyMessage="No Text Type matches"
				failureMessage="Text Type search failed"
				unavailableMessage="This application has no source for Text Types."
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
