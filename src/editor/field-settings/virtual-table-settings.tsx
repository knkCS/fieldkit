import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { useConfirmModal } from "@knkcs/anker/feedback";
import { Radio, RadioGroup } from "@knkcs/anker/primitives";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldKit } from "../../renderer/provider";
import { linkedBlueprintId } from "../../schema/blueprint-link";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { SettingsProps } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import {
	isVirtualTableRowFieldType,
	virtualTableRowSpecKind,
} from "../../schema/virtual-table-row-spec";
import { createField } from "../draft-ops";
import { TypePickerPopover } from "../type-picker-popover";
import { BlueprintPicker } from "./blueprint-picker";
import { CapInput } from "./cap-input";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/**
 * The settings key naming the linked Row Spec's Blueprint. One constant so the
 * picker, the lock and the mode control below cannot drift apart — and not
 * exported: `linkedBlueprintId()` is how anything outside this file reads the
 * link, and a second exported spelling of the key would invite a second reader.
 */
const BLUEPRINT_SETTINGS_KEY = "blueprint";

/** The two ways an Author may declare a Row Spec — the two of
 * `VirtualTableRowSpecKind` an Author can *choose*. "both" and "neither" are
 * states `validateSpec()` refuses, never options on a control. */
type RowSpecMode = "linked" | "embedded";

/**
 * Type-settings editor for `virtual_table`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * Its job is the choice ADR-0017 puts in front of an Author: a Row Spec is
 * **linked** (a Blueprint, picked through the shared `BlueprintPicker` exactly
 * as a Fieldset's is) or **embedded** (the Fields authored in this Field's own
 * `children`, as a Group's rows are) — one or the other, never both and never
 * neither. So the control that chooses is also the control that clears: the
 * moment a Row Spec is declared one way, the other side goes, because a Spec
 * saved with both is one `validateSpec()` refuses.
 *
 * **Linked is offered only where a Consumer registered a blueprint adapter**
 * (and on a Field that already links one, so an adapter going missing never
 * silently misdescribes a saved Field). Embedded needs no adapter at all,
 * which is what keeps `virtual_table` available in every context.
 *
 * Adding a row Field is the ordinary type picker over the flat value types a
 * Row Spec may hold — read from `virtual-table-row-spec.ts`, never retyped
 * here — and configuring one is the config panel's incumbent drill-in, the
 * same Back button and three tabs a Group's child gets. What this component
 * owns is the choice, the list and the caps.
 *
 * Requires a `ConfirmModalProvider` above it (SpecEditor mounts one), the way
 * the Blueprint picker requires a `FieldKitProvider`: discarding a Row Spec an
 * Author authored is not a thing to do silently.
 */
export function VirtualTableSettingsEditor({
	settings,
	field,
	onChange,
	onChildrenChange,
	onDrillIntoChild,
	plugins,
}: SettingsProps<VirtualTableSettings>) {
	const { adapters } = useFieldKit();
	const { confirm } = useConfirmModal();
	// Freezing the Blueprint freezes the CHOICE, and with it every write that
	// changes which way the Row Spec is declared: switching mode, and adding or
	// removing the row Fields an embedded one is made of (ADR-0011).
	const modeLock = useSettingLock(BLUEPRINT_SETTINGS_KEY);

	// CONTEXT.md is deliberate about this word: a Row Spec holds **Fields**,
	// and a "column" is how one of them is shown. So Fields is what this editor
	// calls them, in its code and where an Author reads it.
	const rowFields = field?.children ?? [];
	const kind = field ? virtualTableRowSpecKind(field) : "neither";
	// What the FIELD says, when it says anything. A Field declaring neither (a
	// freshly inserted one, or one whose last row Field was just removed) says
	// nothing, and then the Author's own choice stands.
	const declared: RowSpecMode | null =
		kind === "linked" ? "linked" : kind === "embedded" ? "embedded" : null;

	// Linked needs a Blueprint from somewhere. A Field that already links one
	// keeps the option even where the adapter has since gone, so the panel
	// never describes a linked Field as an embedded one.
	const offersLinked = adapters.blueprint != null || kind === "linked";
	// Switching TO linked discards the row Fields, which is a write to
	// `children` — impossible without the channel for it (a settings editor
	// mounted outside the config panel). Switching the other way only clears a
	// setting, so it is never blocked.
	const canDiscardRowFields =
		rowFields.length === 0 || Boolean(onChildrenChange);

	// The Author's choice while the Field declares nothing yet — a mode is not
	// written anywhere until they pick a Blueprint or add a Field, so this is a
	// view preference, not draft state. Deliberately NOT re-seeded per Field:
	// the Accessor is the only identity available here and it changes on a
	// rename, so re-seeding would throw away a live choice the moment the
	// Author renamed the Field. The cost is that selecting a SECOND Virtual
	// Table that declares nothing either starts on this same mode — harmless,
	// since such a Field has no Row Spec whichever mode is shown, and nothing
	// is written until the Author acts.
	const [chosen, setChosen] = useState<RowSpecMode | null>(null);
	// Bumped to remount the radio group when a switch is REFUSED. The group is
	// controlled by `mode`, but the browser has already moved the selection by
	// the time the click reaches us; declining leaves `mode` unchanged, so
	// nothing would tell the group to put the dot back. Remounting re-reads
	// `value`, which is the honest state — the Row Spec never changed.
	const [resync, setResync] = useState(0);

	const mode: RowSpecMode = offersLinked
		? (declared ?? chosen ?? "embedded")
		: "embedded";

	async function chooseMode(next: RowSpecMode) {
		if (next === mode) return;
		if (next === "linked" && rowFields.length > 0) {
			const ok = await confirm({
				title: "Discard this Row Spec?",
				message:
					"A row's fields come from the blueprint instead. The fields declared here are removed from this virtual table.",
				confirmLabel: "Discard and link",
			});
			if (!ok) {
				setResync((n) => n + 1);
				return;
			}
			onChildrenChange?.([]);
		}
		setChosen(next);
		// The other side, cleared — but only where there IS another side: an
		// unset key written back as `undefined` would dirty the draft for a
		// choice that changed nothing yet.
		if (next === "embedded" && settings?.blueprint !== undefined) {
			onChange({ ...settings, blueprint: undefined });
		}
	}

	function addRowField(pluginId: string) {
		const plugin = plugins?.find((p) => p.id === pluginId);
		if (!plugin) return;
		// Seeded against the row Fields already declared, so the generated
		// Accessor is unique among its own siblings — a row object's keys are
		// these Accessors, and two Fields sharing one would collide in every row.
		const created = createField(plugin, rowFields);
		onChildrenChange?.([...rowFields, created]);
		// Straight into the drill-in: a fresh row Field is named "Number" with a
		// generated Accessor, and neither is what the Author meant.
		onDrillIntoChild?.(created.config.api_accessor);
	}

	function removeRowField(accessor: string) {
		onChildrenChange?.(
			rowFields.filter((f) => f.config.api_accessor !== accessor),
		);
	}

	// The flat value types a Row Spec may hold, and nothing else — no Marker,
	// no container. The rule is ADR-0017's and lives in the schema layer; this
	// is only where it reaches a picker.
	const rowPlugins = plugins?.filter((p) => isVirtualTableRowFieldType(p.id));
	// What the linked side shows, read the way the validator and the resolver
	// read it — so a blank id is "no Blueprint" here too, rather than a link
	// the picker claims and `virtualTableRowSpecKind` denies.
	const linkedBlueprint = field ? linkedBlueprintId(field) : undefined;

	return (
		<Stack gap="4" data-testid="virtual-table-settings">
			<Box>
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Row Spec
				</Text>
				<RadioGroup
					key={resync}
					mt="1"
					size="sm"
					value={mode}
					onValueChange={(e) => void chooseMode(e.value as RowSpecMode)}
				>
					<Stack gap="1">
						{offersLinked && (
							<Radio
								value="linked"
								disabled={modeLock.locked || !canDiscardRowFields}
							>
								A linked blueprint
							</Radio>
						)}
						<Radio value="embedded" disabled={modeLock.locked}>
							Declared in this field
						</Radio>
					</Stack>
				</RadioGroup>
				{!offersLinked && (
					<Text fontSize="xs" color="fg.muted" mt="1">
						Linking a blueprint needs a blueprint adapter.
					</Text>
				)}
				<SettingLockReason lock={modeLock} />
			</Box>

			{mode === "linked" ? (
				<BlueprintPicker
					fieldId={field?.config.api_accessor ?? "virtual_table"}
					settingsKey={BLUEPRINT_SETTINGS_KEY}
					label="Row blueprint"
					helperText="The blueprint whose fields each row holds."
					// One Blueprint, carried as an array of zero or one so the picker
					// has a single contract for both modes.
					value={linkedBlueprint ? [linkedBlueprint] : []}
					onChange={(ids) => onChange({ ...settings, blueprint: ids[0] })}
					selectPlaceholder="Select a blueprint"
					idInputPlaceholder="Blueprint id"
					idInputTestId="virtual-table-blueprint-input"
				/>
			) : (
				<Box>
					<Flex align="center" justify="space-between" mb="1">
						<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
							Row fields
						</Text>
						{rowPlugins && onChildrenChange && (
							<TypePickerPopover
								plugins={rowPlugins}
								currentSpec={rowFields}
								onPick={addRowField}
								triggerLabel="Add row field"
								disabled={modeLock.locked}
							/>
						)}
					</Flex>

					{rowFields.length === 0 ? (
						<Text fontSize="xs" color="fg.muted">
							No fields yet. Every row holds the ones declared here.
						</Text>
					) : (
						rowFields.map((rowField: Field) => (
							<Flex
								key={rowField.config.api_accessor}
								align="center"
								justify="space-between"
								gap="1"
								py="1"
								data-testid={`virtual-table-row-field-${rowField.config.api_accessor}`}
							>
								<Box minWidth="0">
									<Text fontSize="sm">
										{rowField.config.name}
										{rowField.config.required && " *"}
									</Text>
									<Text fontSize="xs" color="fg.muted">
										{rowField.field_type}
									</Text>
								</Box>
								<Flex align="center" gap="1">
									{/* Configuring a row Field is not a write to the Row Spec's
									    shape, so a frozen Blueprint does not disable it — the
									    Field's own settings are its own to freeze. */}
									<Button
										size="xs"
										variant="ghost"
										onClick={() =>
											onDrillIntoChild?.(rowField.config.api_accessor)
										}
										disabled={!onDrillIntoChild}
										data-testid={`virtual-table-row-field-edit-${rowField.config.api_accessor}`}
									>
										Edit
									</Button>
									<IconButton
										aria-label={`Remove ${rowField.config.name}`}
										size="xs"
										variant="ghost"
										onClick={() => removeRowField(rowField.config.api_accessor)}
										disabled={!onChildrenChange || modeLock.locked}
									>
										<Trash2 size={14} />
									</IconButton>
								</Flex>
							</Flex>
						))
					)}
				</Box>
			)}

			<CapInput
				settingsKey="max_records_per_page"
				label="Records per page"
				helperText="Leave empty to show every record on one page."
				value={settings?.max_records_per_page}
				min={1}
				placeholder="All on one page"
				onChange={(cap) => onChange({ ...settings, max_records_per_page: cap })}
				testId="virtual-table-max-records-input"
			/>

			<CapInput
				settingsKey="min_items"
				label="Fewest rows"
				helperText="Leave empty to accept a table with no rows."
				value={settings?.min_items}
				min={0}
				placeholder="No minimum"
				onChange={(cap) => onChange({ ...settings, min_items: cap })}
				testId="virtual-table-min-items-input"
			/>

			<CapInput
				settingsKey="max_items"
				label="Most rows"
				helperText="Leave empty for no limit."
				value={settings?.max_items}
				min={1}
				placeholder="No limit"
				onChange={(cap) => onChange({ ...settings, max_items: cap })}
				testId="virtual-table-max-items-input"
			/>
		</Stack>
	);
}
VirtualTableSettingsEditor.displayName = "VirtualTableSettingsEditor";
