// src/editor/field-settings/single-reference-settings.tsx
import { Box, chakra, Input, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { type ChangeEvent, useId, useState } from "react";
import type { BlueprintSummary } from "../../renderer/adapters";
import { useFieldKit } from "../../renderer/provider";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { SettingsProps } from "../../schema/plugin";
import { useBlueprintList } from "./use-blueprint-list";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
interface BlueprintOption {
	id: string;
	label: string;
}

/**
 * Type-settings editor for `single_reference`, mounted by the config panel's
 * Type settings tab. It lives in the editor layer for the same reason a
 * plugin's field component lives in the renderer and its cell in the table:
 * `/schema` carries no React of its own (CLAUDE.md, Architecture).
 *
 * The Author picks which Blueprints the Field may point at from the ones
 * `adapters.blueprint.list()` offers. That capability is optional (#52), so
 * where it is missing — no blueprint adapter, an adapter from before it
 * existed, or a listing that failed — the panel falls back to Blueprint id
 * entry rather than leaving the Field unconfigurable.
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
	const { adapters, onError } = useFieldKit();
	// The Consumer's own error channel, not the console: a listing failure is
	// theirs to surface. Reported against the Field being configured, which is
	// the one the failure leaves harder to configure.
	const { blueprints, status } = useBlueprintList(
		adapters.blueprint,
		(error) => {
			const fieldId = field?.config.api_accessor ?? "single_reference";
			if (onError) onError(error, fieldId);
			else console.error("Blueprint list fetch failed:", error);
		},
	);
	const selectedIds = settings?.blueprints ?? [];
	const inputId = useId();

	const options = toOptions(blueprints, selectedIds);
	const selected = selectedIds.map(
		(id) => options.find((option) => option.id === id) ?? { id, label: id },
	);

	// What the Author has actually typed in the degraded id input, which is
	// not the same string as the stored ids joined back up: parsing drops the
	// separator, so re-deriving the text every keystroke would eat the comma
	// the moment it was typed. Re-seeded — the documented way to adjust state
	// from props — only when the stored ids stop matching what is typed, which
	// is how selecting another Field in the panel refreshes the input.
	const idsText = selectedIds.join(", ");
	const [typed, setTyped] = useState(idsText);
	if (parseIds(typed).join(", ") !== idsText) setTyped(idsText);

	function handleBlueprintIds(e: ChangeEvent<HTMLInputElement>) {
		setTyped(e.target.value);
		onChange({ ...settings, blueprints: parseIds(e.target.value) });
	}

	return (
		<Box>
			{/* `htmlFor` rather than wrapping, because a <label> around
			    react-select's composite would name the widget from everything
			    inside it. */}
			<chakra.label
				htmlFor={inputId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				Blueprints
			</chakra.label>

			{status === "unavailable" ? (
				<Input
					id={inputId}
					size="sm"
					value={typed}
					onChange={handleBlueprintIds}
					placeholder="Blueprint ids, comma separated"
					data-testid="single-reference-blueprints-input"
				/>
			) : (
				<BaseSelect<BlueprintOption>
					inputId={inputId}
					// Matches the id input this replaces, and the panel's other
					// controls — one setting must not change size with the adapter.
					size="sm"
					isMulti
					options={options}
					value={selected}
					onChange={(next) => {
						const picked = Array.isArray(next) ? next : next ? [next] : [];
						onChange({
							...settings,
							blueprints: picked.map((option) => option.id),
						});
					}}
					loading={status === "loading"}
					placeholder="Any blueprint"
					// react-select shows this after filtering too, so an Author
					// whose search matched nothing must not be told they have no
					// blueprints at all.
					noOptionsMessage={({ inputValue }) =>
						inputValue ? "No blueprint matches" : "No blueprints available"
					}
				/>
			)}

			<Text fontSize="xs" color="fg.muted" mt="1" mb="3">
				The blueprints this field may point at. Leave empty to allow any.
			</Text>
		</Box>
	);
}
SingleReferenceSettingsEditor.displayName = "SingleReferenceSettingsEditor";

function parseIds(text: string): string[] {
	return text
		.split(",")
		.map((id) => id.trim())
		.filter((id) => id.length > 0);
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
	// this Author may no longer reference — stays selected under its raw id.
	// The alternative is a picker that silently drops a Spec's setting the
	// moment it is opened.
	for (const id of selectedIds) {
		if (!options.some((option) => option.id === id)) {
			options.unshift({ id, label: id });
		}
	}

	return options;
}
