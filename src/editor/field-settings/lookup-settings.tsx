// src/editor/field-settings/lookup-settings.tsx
import { Box, chakra, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { useContext, useId, useMemo } from "react";
import { FieldKitContext } from "../../renderer/context";
import type { LookupSettings } from "../../schema/field-types/lookup";
import type { SettingsProps } from "../../schema/plugin";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/** Every string the Lookup settings editor renders. */
export interface LookupSettingsLabels {
	/** The select's label. */
	source: string;
	/** Under the select, while there are Sources and the stored one is one. */
	sourceHelper: string;
	/** The select with nothing chosen. */
	sourcePlaceholder: string;
	/** Under the select when the stored id is not among the registered ones. */
	sourceNotRegistered: string;
	/** Under the select when the host registered no Source at all. */
	noSourcesRegistered: string;
}

export const DEFAULT_LOOKUP_SETTINGS_LABELS: LookupSettingsLabels = {
	source: "Source",
	sourceHelper: "One of the sources this application registered.",
	sourcePlaceholder: "Choose a source",
	sourceNotRegistered:
		"Not registered here. The Field keeps this source, but this application can't serve it.",
	noSourcesRegistered:
		"This application registers no sources, so there is none to choose.",
};

export interface LookupSettingsEditorProps
	extends SettingsProps<LookupSettings> {
	/** Overrides the English defaults, key by key. The config panel mounts
	 * this editor without any; a Consumer translating it wraps the plugin's
	 * `settingsComponent`. */
	labels?: Partial<LookupSettingsLabels>;
}

/** react-select's option shape (anker's `BaseOption`). */
interface SourceOption {
	id: string;
	label: string;
}

/**
 * Type-settings editor for `lookup`: which Source the Field points into.
 *
 * **The registered Sources are the list** (blueprinthub ADR 0009). A Consumer
 * registers its Sources as a record on `adapters.lookup` (ADR-0015), so the
 * record's keys are exactly the ids a Field in this application can be served
 * by — fieldkit still never learns what any of them hold.
 *
 * **A stored id is never rewritten.** A Source registered in one host and not
 * in another is legitimate (one Blueprint is edited in several), so an id this
 * host doesn't know shows as stored, raw, with a warning — and is never offered
 * as an option, which would claim this host can serve it. With no Sources at
 * all the select is disabled and says so; nothing is written.
 *
 * Reads the context directly rather than through `useFieldKit`, which throws:
 * an editor mounted outside a provider (a story, a Consumer's own panel) has no
 * Sources, and that is a state this control already renders.
 */
export function LookupSettingsEditor({
	settings,
	onChange,
	labels: labelOverrides,
}: LookupSettingsEditorProps) {
	const labels = { ...DEFAULT_LOOKUP_SETTINGS_LABELS, ...labelOverrides };
	const inputId = useId();
	const lock = useSettingLock("source");
	const lookup = useContext(FieldKitContext)?.adapters.lookup;
	const source = settings?.source ?? "";

	const options = useMemo<SourceOption[]>(
		() => Object.keys(lookup ?? {}).map((id) => ({ id, label: id })),
		[lookup],
	);
	const noSources = options.length === 0;
	const notRegistered =
		source !== "" && !noSources && !options.some((o) => o.id === source);
	// The stored id as it is, registered or not: the raw id is the label, just
	// as it is an option's.
	const selected = source === "" ? null : { id: source, label: source };

	return (
		<Box>
			{/* `htmlFor` rather than wrapping: a <label> around react-select's
			    composite would name the widget from everything inside it (see
			    blueprint-picker.tsx). */}
			<chakra.label
				htmlFor={inputId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				{labels.source}
			</chakra.label>

			<Box data-testid="lookup-source-select">
				<BaseSelect<SourceOption>
					inputId={inputId}
					// Matches the panel's other controls.
					size="sm"
					options={options}
					value={selected}
					placeholder={labels.sourcePlaceholder}
					isClearable
					disabled={lock.locked || noSources}
					onChange={(next) => {
						const option = Array.isArray(next) ? next[0] : next;
						// Cleared names no Source, stored as the plugin's default
						// empty string.
						onChange({ ...settings, source: option ? option.id : "" });
					}}
				/>
			</Box>

			{/* The lock's reason replaces the helper rather than joining it: it
			    is the one sentence about an edit that can still be made. */}
			{lock.locked ? (
				<SettingLockReason lock={lock} />
			) : (
				<Text
					fontSize="xs"
					color={notRegistered ? "fg.warning" : "fg.muted"}
					mt="1"
				>
					{noSources
						? labels.noSourcesRegistered
						: notRegistered
							? labels.sourceNotRegistered
							: labels.sourceHelper}
				</Text>
			)}
		</Box>
	);
}
LookupSettingsEditor.displayName = "LookupSettingsEditor";
