// src/editor/field-settings/blueprint-picker.tsx
import { Box, chakra, Input, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { type ChangeEvent, useId, useState } from "react";
import type { BlueprintSummary } from "../../renderer/adapters";
import { useAdapterErrorReporter } from "../../renderer/hooks/use-adapter-error-reporter";
import { useFieldKit } from "../../renderer/provider";
import { SettingLockReason, useSettingLock } from "./setting-lock";
import { useBlueprintList } from "./use-blueprint-list";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
interface BlueprintOption {
	id: string;
	label: string;
}

export interface BlueprintPickerProps {
	/** The Field being configured, so an Adapter failure names the Field it
	 * leaves harder to configure. */
	fieldId: string;
	/**
	 * The settings key this picker writes — `blueprints` for the reference
	 * types, `blueprint` for a Fieldset. Declared so the control honours
	 * `locked_settings` itself, in both of its modes: a frozen setting must not
	 * become editable just because the adapter cannot enumerate Blueprints and
	 * the picker degraded to id entry (ADR-0011).
	 */
	settingsKey: string;
	label: string;
	helperText: string;
	/** Several Blueprints rather than one. Changes the control and how the
	 * degraded id input is read: one raw id, or a comma-separated list. */
	multiple?: boolean;
	/** The Blueprint ids currently set. One-Blueprint callers pass an array of
	 * zero or one, which is what keeps a single contract for both modes. */
	value: string[];
	onChange: (blueprintIds: string[]) => void;
	selectPlaceholder: string;
	idInputPlaceholder: string;
	idInputTestId: string;
}

/**
 * Picks the Blueprint(s) a setting names, from the ones
 * `adapters.blueprint.list()` offers.
 *
 * That capability is optional (#52), so where it is missing — no blueprint
 * adapter, an adapter from before it existed, or a listing that failed — this
 * falls back to Blueprint id entry rather than leaving the Field
 * unconfigurable. Shared by every settings editor that names Blueprints, so
 * the degrade is written down once.
 */
export function BlueprintPicker({
	fieldId,
	settingsKey,
	label,
	helperText,
	multiple = false,
	value,
	onChange,
	selectPlaceholder,
	idInputPlaceholder,
	idInputTestId,
}: BlueprintPickerProps) {
	const lock = useSettingLock(settingsKey);
	const { adapters } = useFieldKit();
	const report = useAdapterErrorReporter(
		fieldId,
		"Blueprint list fetch failed",
	);
	const { blueprints, status } = useBlueprintList(adapters.blueprint, report);
	const inputId = useId();

	const options = toOptions(blueprints, value);
	const selected = value.map(
		(id) => options.find((option) => option.id === id) ?? { id, label: id },
	);

	// What the Author has actually typed in the degraded id input, which is not
	// the same string as the stored ids joined back up: parsing a list drops
	// the separator, so re-deriving the text every keystroke would eat the
	// comma the moment it was typed. Re-seeded — the documented way to adjust
	// state from props — only when the stored ids stop matching what is typed,
	// which is how selecting another Field in the panel refreshes the input.
	const idsText = value.join(", ");
	const [typed, setTyped] = useState(idsText);
	if (parseIds(typed, multiple).join(", ") !== idsText) setTyped(idsText);

	function handleTyped(e: ChangeEvent<HTMLInputElement>) {
		setTyped(e.target.value);
		onChange(parseIds(e.target.value, multiple));
	}

	return (
		<Box>
			{/* The helper sits outside the label on purpose: a <label> wraps its
			    descendants into the control's accessible name (see
			    list-settings.tsx). `htmlFor` rather than wrapping, because a
			    <label> around react-select's composite would name the widget
			    from everything inside it. */}
			<chakra.label
				htmlFor={inputId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				{label}
			</chakra.label>

			{status === "unavailable" ? (
				<Input
					id={inputId}
					size="sm"
					value={typed}
					onChange={handleTyped}
					placeholder={idInputPlaceholder}
					disabled={lock.locked}
					data-testid={idInputTestId}
				/>
			) : (
				<BaseSelect<BlueprintOption>
					inputId={inputId}
					// Matches the id input this replaces, and the panel's other
					// controls — one setting must not change size with the adapter.
					size="sm"
					isMulti={multiple}
					options={options}
					disabled={lock.locked}
					value={multiple ? selected : (selected[0] ?? null)}
					onChange={(next) => {
						const picked = Array.isArray(next) ? next : next ? [next] : [];
						onChange(picked.map((option) => option.id));
					}}
					loading={status === "loading"}
					placeholder={selectPlaceholder}
					// react-select shows this after filtering too, so an Author
					// whose search matched nothing must not be told they have no
					// blueprints at all.
					noOptionsMessage={({ inputValue }) =>
						inputValue ? "No blueprint matches" : "No blueprints available"
					}
				/>
			)}

			<Text fontSize="xs" color="fg.muted" mt="1" mb={lock.locked ? "1" : "3"}>
				{helperText}
			</Text>
			<SettingLockReason lock={lock} />
		</Box>
	);
}
BlueprintPicker.displayName = "BlueprintPicker";

function parseIds(text: string, multiple: boolean): string[] {
	const parts = multiple ? text.split(",") : [text];
	return parts.map((id) => id.trim()).filter((id) => id.length > 0);
}

function toOptions(
	blueprints: BlueprintSummary[] | null,
	selectedIds: string[],
): BlueprintOption[] {
	const options = (blueprints ?? []).map((blueprint) => ({
		id: blueprint.id,
		label: blueprint.name,
	}));

	// A stored Blueprint the list does not offer — one since deleted, or one
	// this Author may no longer use — stays selected under its raw id. The
	// alternative is a picker that silently drops a Spec's setting the moment
	// it is opened.
	for (const id of selectedIds) {
		if (!options.some((option) => option.id === id)) {
			options.unshift({ id, label: id });
		}
	}

	return options;
}
