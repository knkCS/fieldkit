// src/editor/field-settings/fieldset-settings.tsx
import { Box, chakra, Input, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { type ChangeEvent, useId } from "react";
import type { BlueprintSummary } from "../../renderer/adapters";
import { useFieldKit } from "../../renderer/provider";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { SettingsProps } from "../../schema/plugin";
import { useBlueprintList } from "./use-blueprint-list";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
interface BlueprintOption {
	id: string;
	label: string;
}

/**
 * Type-settings editor for `fieldset`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * The Author picks the Blueprint from the ones `adapters.blueprint.list()`
 * offers. That capability is optional (#52), so where it is missing — no
 * blueprint adapter, an adapter from before it existed, or a listing that
 * failed — the panel falls back to Blueprint id entry rather than leaving the
 * Fieldset unconfigurable.
 */
export function FieldsetSettingsEditor({
	settings,
	onChange,
}: SettingsProps<FieldsetSettings>) {
	const { adapters } = useFieldKit();
	const { blueprints, status } = useBlueprintList(adapters.blueprint);
	const blueprintId = settings?.blueprint;
	const inputId = useId();

	const options = toOptions(blueprints, blueprintId);
	const selected = options.find((option) => option.id === blueprintId) ?? null;

	function handleBlueprintId(e: ChangeEvent<HTMLInputElement>) {
		const blueprint = e.target.value.trim();
		onChange({ ...settings, blueprint: blueprint || undefined });
	}

	function handleCollapsible(e: ChangeEvent<HTMLInputElement>) {
		onChange({ ...settings, collapsible: e.target.checked });
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
				Blueprint
			</chakra.label>

			{status === "unavailable" ? (
				<Input
					id={inputId}
					size="sm"
					value={blueprintId ?? ""}
					onChange={handleBlueprintId}
					placeholder="Blueprint id"
					data-testid="fieldset-blueprint-input"
				/>
			) : (
				<BaseSelect<BlueprintOption>
					inputId={inputId}
					// Matches the id input this replaces, and the panel's other
					// controls — one setting must not change size with the adapter.
					size="sm"
					options={options}
					value={selected}
					onChange={(next) => {
						const picked = Array.isArray(next) ? next[0] : next;
						onChange({ ...settings, blueprint: picked?.id ?? undefined });
					}}
					loading={status === "loading"}
					placeholder="Select a blueprint"
					// react-select shows this after filtering too, so an Author
					// whose search matched nothing must not be told they have no
					// blueprints at all.
					noOptionsMessage={({ inputValue }) =>
						inputValue ? "No blueprint matches" : "No blueprints available"
					}
				/>
			)}

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

function toOptions(
	blueprints: BlueprintSummary[] | null,
	blueprintId: string | undefined,
): BlueprintOption[] {
	const options = (blueprints ?? []).map((blueprint) => ({
		id: blueprint.id,
		label: blueprint.name,
	}));

	// A stored Blueprint the list does not offer — one since deleted, or one
	// this Author may no longer embed — stays selected under its raw id. The
	// alternative is a picker that silently drops a Spec's setting the moment
	// it is opened.
	if (blueprintId && !options.some((option) => option.id === blueprintId)) {
		options.unshift({ id: blueprintId, label: blueprintId });
	}

	return options;
}
