// src/editor/field-settings/reference-blueprints-editor.tsx
import { Stack } from "@chakra-ui/react";
import {
	type ReferenceBlueprint,
	referenceBlueprints,
} from "../../schema/reference";
import {
	BlueprintPicker,
	useBlueprintPurposeDeclined,
	useBlueprintSource,
} from "./blueprint-picker";

export interface ReferenceBlueprintsEditorProps {
	/** The Field being configured, for the pickers' error reports. */
	fieldId: string;
	/** The `blueprints` setting as it stands. */
	value: ReferenceBlueprint[] | undefined;
	onChange: (blueprints: ReferenceBlueprint[]) => void;
	/** Test id prefix of the pickers; each linked Reference Spec picker adds
	 * `-spec-<blueprint>`. */
	testId: string;
}

/**
 * A reference-shaped Field's `blueprints`: the Blueprints it may point at, and
 * for each an optional **linked Reference Spec** — a Blueprint Release whose
 * Fields replace the embedded Reference Spec for References to that Blueprint,
 * never merged with it (ADR-0008, amended).
 *
 * Shared by both reference settings editors, as `PinModePicker` is: the
 * setting means the same for one Reference as for a tree. Every picker writes
 * the one `blueprints` key, so freezing it freezes them all (ADR-0011).
 *
 * Repointing or clearing a linked Reference Spec drops the entry's resolved
 * `spec` with it, as repointing a Fieldset drops its `children`: what was
 * inlined belongs to the Release that is no longer named.
 */
export function ReferenceBlueprintsEditor({
	fieldId,
	value,
	onChange,
	testId,
}: ReferenceBlueprintsEditorProps) {
	// Two purposes in one setting: the targets are Blueprints a Reference may
	// point at, and a linked Reference Spec is a Release embedded into each
	// Reference as a Fieldset's is — so it asks with `fieldset` (ADR-0027).
	const targetSource = useBlueprintSource("reference_target");
	const specSource = useBlueprintSource("fieldset");
	// A Consumer that declines `fieldset` (taskhub: a task type never links a
	// released part) is not offered a linked Reference Spec at all — only an
	// entry that already links one shows it, readable (ADR-0027, amended).
	const specDeclined = useBlueprintPurposeDeclined("fieldset");
	const entries = referenceBlueprints({ blueprints: value });

	function setBlueprints(ids: string[]) {
		onChange(
			ids.map(
				(id) =>
					entries.find((entry) => entry.blueprint === id) ?? { blueprint: id },
			),
		);
	}

	function setLinked(blueprint: string, release: string | undefined) {
		onChange(
			entries.map((entry) => {
				if (entry.blueprint !== blueprint) return entry;
				const { spec_blueprint: _, spec: __, ...rest } = entry;
				return release ? { ...rest, spec_blueprint: release } : rest;
			}),
		);
	}

	return (
		<Stack gap="4">
			<BlueprintPicker
				fieldId={fieldId}
				settingsKey="blueprints"
				label="Blueprints"
				helperText="The blueprints this field may point at. Leave empty to allow any."
				multiple
				value={entries.map((entry) => entry.blueprint)}
				onChange={setBlueprints}
				placeholder="Any blueprint"
				testId={testId}
				source={targetSource}
			/>
			{entries
				.filter((entry) => !specDeclined || entry.spec_blueprint)
				.map((entry) => (
					<BlueprintPicker
						key={entry.blueprint}
						fieldId={fieldId}
						settingsKey="blueprints"
						label={`Reference Spec for ${entry.blueprint}`}
						helperText="A blueprint release whose fields replace the Reference Spec for references to this blueprint. Leave empty to use the Reference Spec below."
						value={entry.spec_blueprint ? [entry.spec_blueprint] : []}
						onChange={([release]) => setLinked(entry.blueprint, release)}
						placeholder="The Reference Spec below"
						testId={`${testId}-spec-${entry.blueprint}`}
						source={specSource}
					/>
				))}
		</Stack>
	);
}
ReferenceBlueprintsEditor.displayName = "ReferenceBlueprintsEditor";
