import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { useConfirmModal } from "@knkcs/anker/feedback";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFieldKit } from "../../renderer/provider";
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

/** The settings key naming the linked Row Spec's Blueprint. One constant, so
 * the picker, the lock and the mode control cannot drift apart. */
export const VIRTUAL_TABLE_BLUEPRINT_SETTINGS_KEY = "blueprint";

/** The two ways an Author may declare a Row Spec — the two of
 * `VirtualTableRowSpecKind` an Author can *choose*. "both" and "neither" are
 * states validateSpec refuses, never options on a control. */
type RowSpecMode = "linked" | "embedded";

/**
 * Type-settings editor for `virtual_table`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * Its job is the choice ADR-0017 puts in front of an Author: a Row Spec is
 * **linked** (a Blueprint, picked through the shared `BlueprintPicker` exactly
 * as a Fieldset's is) or **embedded** (columns authored in the Field's own
 * `children`, as a Group's rows are) — one or the other, never both and never
 * neither. So the control that chooses is also the control that clears: the
 * moment a Row Spec is declared one way, the other side goes, because the Spec
 * an Author saves with both is one `validateSpec()` refuses.
 *
 * **Linked is offered only where a Consumer registered a blueprint adapter**
 * (and on a Field that already links one, so an adapter going missing never
 * silently misdescribes a saved Field). Embedded needs no adapter at all,
 * which is what keeps `virtual_table` available in every context.
 *
 * Adding a column is the ordinary type picker over the flat value types a Row
 * Spec may hold — read from `virtual-table-row-spec.ts`, never retyped here —
 * and configuring one is the config panel's incumbent drill-in, the same Back
 * button and three tabs a Group's child gets. What this component owns is the
 * choice, the list and the caps.
 *
 * Requires a `ConfirmModalProvider` above it (SpecEditor mounts one), the way
 * the Blueprint picker requires a `FieldKitProvider`: discarding authored
 * columns is not a thing to do silently.
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
	// Freezing the Blueprint freezes the CHOICE, not just the picker: switching
	// to embedded columns clears `settings.blueprint`, which is the very write
	// the Consumer froze (ADR-0011).
	const modeLock = useSettingLock(VIRTUAL_TABLE_BLUEPRINT_SETTINGS_KEY);

	const columns = field?.children ?? [];
	const kind = field ? virtualTableRowSpecKind(field) : "neither";
	// What the FIELD says, when it says anything. A Field declaring neither
	// (a freshly inserted one, or one whose last column was just removed) says
	// nothing, and then the Author's own choice stands.
	const declared: RowSpecMode | null =
		kind === "linked" ? "linked" : kind === "embedded" ? "embedded" : null;

	// Linked needs a Blueprint from somewhere. A Field that already links one
	// keeps the option even where the adapter has since gone, so the panel
	// never describes a linked Field as an embedded one.
	const offersLinked = adapters.blueprint != null || kind === "linked";
	// Switching clears the other side, and clearing columns is a write to
	// `children` — impossible without the channel for it (a settings editor
	// mounted outside the config panel). Then the Row Spec is readable but not
	// re-choosable, rather than switchable into a state nothing can repair.
	const canSwitch = Boolean(onChildrenChange);

	const accessor = field?.config.api_accessor ?? "";
	// Re-seeded — the documented way to adjust state from props — when the
	// panel starts configuring a different Field: this component stays mounted
	// across that switch, and a choice made for one Virtual Table must not
	// describe the next one.
	const [seeded, setSeeded] = useState(accessor);
	const [chosen, setChosen] = useState<RowSpecMode | null>(null);
	if (seeded !== accessor) {
		setSeeded(accessor);
		setChosen(null);
	}

	const mode: RowSpecMode = offersLinked
		? (declared ?? chosen ?? "embedded")
		: "embedded";

	async function chooseMode(next: RowSpecMode) {
		if (next === mode) return;
		if (next === "linked" && columns.length > 0) {
			const ok = await confirm({
				title: "Discard the authored columns?",
				message:
					"A row's fields come from the blueprint instead. The columns authored here are removed from this field.",
				confirmLabel: "Discard and link",
			});
			if (!ok) return;
		}
		setChosen(next);
		if (next === "linked") onChildrenChange?.([]);
		// The other side, cleared: a Field carrying a Blueprint AND columns is
		// the ambiguity ADR-0017 exists to prevent.
		else onChange({ ...settings, blueprint: undefined });
	}

	function addColumn(pluginId: string) {
		const plugin = plugins?.find((p) => p.id === pluginId);
		if (!plugin) return;
		// Seeded against the columns already declared, so the generated Accessor
		// is unique among its own siblings — the row object's keys are these
		// Accessors, and two columns sharing one would collide in every row.
		const created = createField(plugin, columns);
		onChildrenChange?.([...columns, created]);
		// Straight into the drill-in: a fresh column is named "Number" with a
		// generated Accessor, and neither is what the Author meant.
		onDrillIntoChild?.(created.config.api_accessor);
	}

	function removeColumn(columnAccessor: string) {
		onChildrenChange?.(
			columns.filter((c) => c.config.api_accessor !== columnAccessor),
		);
	}

	// The flat value types a Row Spec may hold, and nothing else — no Marker,
	// no container. The rule is ADR-0017's and lives in the schema layer; this
	// is only where it reaches a picker.
	const rowPlugins = plugins?.filter((p) => isVirtualTableRowFieldType(p.id));

	return (
		<Stack gap="4" data-testid="virtual-table-settings">
			<Box>
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Row fields
				</Text>
				<Stack gap="1" mt="1">
					{offersLinked && (
						<Box as="label" display="flex" alignItems="center" gap="2">
							<input
								type="radio"
								name={`virtual-table-row-spec-${accessor}`}
								checked={mode === "linked"}
								disabled={modeLock.locked || !canSwitch}
								onChange={() => void chooseMode("linked")}
								data-testid="virtual-table-linked-input"
							/>
							<Text fontSize="sm">Linked blueprint</Text>
						</Box>
					)}
					<Box as="label" display="flex" alignItems="center" gap="2">
						<input
							type="radio"
							name={`virtual-table-row-spec-${accessor}`}
							checked={mode === "embedded"}
							disabled={modeLock.locked || !canSwitch}
							onChange={() => void chooseMode("embedded")}
							data-testid="virtual-table-embedded-input"
						/>
						<Text fontSize="sm">Columns in this field</Text>
					</Box>
				</Stack>
				{!offersLinked && (
					<Text fontSize="xs" color="fg.muted" mt="1">
						Linking a blueprint needs a blueprint adapter.
					</Text>
				)}
				<SettingLockReason lock={modeLock} />
			</Box>

			{mode === "linked" ? (
				<BlueprintPicker
					fieldId={accessor || "virtual_table"}
					settingsKey={VIRTUAL_TABLE_BLUEPRINT_SETTINGS_KEY}
					label="Row blueprint"
					helperText="The blueprint whose fields each row holds."
					// One Blueprint, carried as an array of zero or one so the picker
					// has a single contract for both modes.
					value={settings?.blueprint ? [settings.blueprint] : []}
					onChange={(ids) => onChange({ ...settings, blueprint: ids[0] })}
					selectPlaceholder="Select a blueprint"
					idInputPlaceholder="Blueprint id"
					idInputTestId="virtual-table-blueprint-input"
				/>
			) : (
				<Box>
					<Flex align="center" justify="space-between" mb="1">
						<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
							Columns
						</Text>
						{rowPlugins && onChildrenChange && (
							<TypePickerPopover
								plugins={rowPlugins}
								currentSpec={columns}
								onPick={addColumn}
								triggerLabel="Add column"
								disabled={modeLock.locked}
							/>
						)}
					</Flex>

					{columns.length === 0 ? (
						<Text fontSize="xs" color="fg.muted">
							No columns yet. Every row holds the ones declared here.
						</Text>
					) : (
						columns.map((column: Field) => (
							<Flex
								key={column.config.api_accessor}
								align="center"
								justify="space-between"
								gap="1"
								py="1"
								data-testid={`virtual-table-column-${column.config.api_accessor}`}
							>
								<Box minWidth="0">
									<Text fontSize="sm">
										{column.config.name}
										{column.config.required && " *"}
									</Text>
									<Text fontSize="xs" color="fg.muted">
										{column.field_type}
									</Text>
								</Box>
								<Flex align="center" gap="1">
									<Button
										size="xs"
										variant="ghost"
										onClick={() =>
											onDrillIntoChild?.(column.config.api_accessor)
										}
										disabled={!onDrillIntoChild}
										data-testid={`virtual-table-column-edit-${column.config.api_accessor}`}
									>
										Edit
									</Button>
									<IconButton
										aria-label={`Remove ${column.config.name}`}
										size="xs"
										variant="ghost"
										onClick={() => removeColumn(column.config.api_accessor)}
										disabled={!onChildrenChange}
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
