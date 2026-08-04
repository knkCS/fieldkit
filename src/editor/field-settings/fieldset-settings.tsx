// src/editor/field-settings/fieldset-settings.tsx
import { Box, chakra, Input, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { type ChangeEvent, useEffect, useState } from "react";
import type { BlueprintSummary } from "../../renderer/adapters";
import { useFieldKit } from "../../renderer/provider";
import type { FieldsetSettings } from "../../schema/field-types/fieldset";
import type { SettingsProps } from "../../schema/plugin";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
interface BlueprintOption {
	id: string;
	label: string;
}

/** "unavailable" is both "the adapter cannot list" and "listing failed" —
 * the Author gets id entry either way, so the panel does not need to tell
 * them apart. */
type ListStatus = "loading" | "ready" | "unavailable";

const BLUEPRINT_INPUT_ID = "fieldset-blueprint";

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
	const { blueprints, status } = useBlueprintList(adapters.blueprint?.list);
	const blueprintId = settings?.blueprint;

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
				htmlFor={BLUEPRINT_INPUT_ID}
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
					id={BLUEPRINT_INPUT_ID}
					size="sm"
					value={blueprintId ?? ""}
					onChange={handleBlueprintId}
					placeholder="Blueprint id"
					data-testid="fieldset-blueprint-input"
				/>
			) : (
				<BaseSelect<BlueprintOption>
					inputId={BLUEPRINT_INPUT_ID}
					options={toOptions(blueprints, blueprintId)}
					value={toValue(blueprints, blueprintId)}
					onChange={(next) => {
						const selected = Array.isArray(next) ? next[0] : next;
						onChange({ ...settings, blueprint: selected?.id ?? undefined });
					}}
					loading={status === "loading"}
					placeholder="Select a blueprint"
					noOptionsMessage={() => "No blueprints available"}
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

function toValue(
	blueprints: BlueprintSummary[] | null,
	blueprintId: string | undefined,
): BlueprintOption | null {
	if (!blueprintId) return null;

	return (
		toOptions(blueprints, blueprintId).find(
			(option) => option.id === blueprintId,
		) ?? null
	);
}

/**
 * The Blueprints on offer, fetched once per mount — the panel lives only as
 * long as an Author has one Fieldset selected, so a stale catalogue is not a
 * risk worth caching against.
 *
 * A rejected listing is reported and then treated as no capability at all:
 * the Author gets id entry and can still finish the job, which is the point
 * of keeping that fallback (#52).
 */
function useBlueprintList(
	list: (() => Promise<BlueprintSummary[]>) | undefined,
) {
	const [blueprints, setBlueprints] = useState<BlueprintSummary[] | null>(null);
	// Seeded rather than defaulted: the effect runs after the first paint, and
	// an adapter that can list must not flash the id input in the meantime.
	const [status, setStatus] = useState<ListStatus>(() =>
		list ? "loading" : "unavailable",
	);

	useEffect(() => {
		if (!list) {
			setStatus("unavailable");
			return;
		}

		let cancelled = false;
		setStatus("loading");
		list()
			.then((items) => {
				if (cancelled) return;
				setBlueprints(items);
				setStatus("ready");
			})
			.catch((error) => {
				if (cancelled) return;
				console.error("Blueprint list fetch failed:", error);
				setBlueprints(null);
				setStatus("unavailable");
			});

		return () => {
			cancelled = true;
		};
	}, [list]);

	return { blueprints, status };
}
