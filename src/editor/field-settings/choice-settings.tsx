// src/editor/field-settings/choice-settings.tsx
import {
	Box,
	Button,
	Flex,
	IconButton,
	Input,
	Stack,
	Text,
} from "@chakra-ui/react";
import { Plus, X } from "lucide-react";
import { createContext, type ReactNode, useContext, useRef } from "react";
import {
	type ChoiceOption,
	choiceOptionsRules,
	choiceOptionsSchema,
	optionKeyFromLabel,
} from "../../schema/choice-options";
import type { SettingsProps } from "../../schema/plugin";
import { validateSettings } from "../../schema/validate-settings";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/**
 * The strings the choice types' settings editor renders. Every one is an
 * EditorLabels key of the same name, so a host's labels reach it through
 * `SpecEditor`'s `labels` with no renaming layer; `{n}` is the Option's
 * 1-based place, `{key}` its Key.
 */
export interface ChoiceSettingsLabels {
	choiceOptions: string;
	choiceOptionsEmpty: string;
	choiceOptionAdd: string;
	choiceOptionLabel: string;
	choiceOptionKey: string;
	choiceOptionLabelOf: string;
	choiceOptionKeyOf: string;
	choiceOptionRemove: string;
	choiceMultiple: string;
	choiceOptionErrorLabel: string;
	choiceOptionErrorKey: string;
	choiceOptionErrorDuplicateKey: string;
}

export const DEFAULT_CHOICE_SETTINGS_LABELS: ChoiceSettingsLabels = {
	choiceOptions: "Options",
	choiceOptionsEmpty: "No options yet",
	choiceOptionAdd: "Add option",
	choiceOptionLabel: "Label",
	choiceOptionKey: "Key",
	choiceOptionLabelOf: "Label of option {n}",
	choiceOptionKeyOf: "Key of option {n}",
	choiceOptionRemove: "Remove option {n}",
	choiceMultiple: "Multiple",
	choiceOptionErrorLabel: "Label must not be empty",
	choiceOptionErrorKey:
		"Key must be lowercase letters, digits, - or _, start with a letter or digit, and be at most 64 characters",
	choiceOptionErrorDuplicateKey: 'Key "{key}" is used by an earlier option',
};

/**
 * A context rather than a prop on `SettingsProps`, for the reason the lock is
 * one (`setting-lock.tsx`): the panel knows the host's labels, a settings
 * component is mounted by the panel, and the contract every Consumer's
 * settings component compiles against stays as it is. Outside a provider —
 * a story, a Consumer's own panel — the English defaults apply.
 */
const ChoiceSettingsLabelsContext = createContext<ChoiceSettingsLabels>(
	DEFAULT_CHOICE_SETTINGS_LABELS,
);

export function ChoiceSettingsLabelsProvider({
	labels,
	children,
}: {
	labels: ChoiceSettingsLabels;
	children: ReactNode;
}) {
	return (
		<ChoiceSettingsLabelsContext.Provider value={labels}>
			{children}
		</ChoiceSettingsLabelsContext.Provider>
	);
}
ChoiceSettingsLabelsProvider.displayName = "ChoiceSettingsLabelsProvider";

/** The settings the three choice types share; `multiple` is select's. */
export interface ChoiceSettings {
	options: ChoiceOption[];
	multiple?: boolean;
}

/** One row as the editor shows it: the stored entry read leniently, so a
 * row lines up with its index in the stored list whatever that entry holds. */
interface Row {
	key: string;
	label: string;
}

function toRow(entry: unknown): Row {
	if (typeof entry !== "object" || entry === null)
		return { key: "", label: "" };
	const { key, label } = entry as { key?: unknown; label?: unknown };
	return {
		key: typeof key === "string" ? key : "",
		label: typeof label === "string" ? label : "",
	};
}

/** What is wrong with each row, by index — from the very rules
 * `validateSpec` applies on save: the schema (Key pattern, non-empty Label)
 * and the unique-Key rule. */
interface RowErrors {
	key?: "invalid" | "duplicate";
	label?: boolean;
}

function rowErrors(options: unknown[]): Map<number, RowErrors> {
	const byRow = new Map<number, RowErrors>();
	const at = (index: number) => {
		const errors = byRow.get(index) ?? {};
		byRow.set(index, errors);
		return errors;
	};
	for (const error of validateSettings(choiceOptionsSchema, options)) {
		const [, index, part] = error.path.split("/");
		if (index === undefined) continue;
		if (part === "key") at(Number(index)).key ??= "invalid";
		if (part === "label") at(Number(index)).label = true;
	}
	for (const error of choiceOptionsRules({
		field_type: "select",
		config: { name: "", api_accessor: "", required: false, instructions: "" },
		settings: { options },
		system: false,
	})) {
		const index = error.segments[2];
		if (typeof index === "number") at(index).key = "duplicate";
	}
	return byRow;
}

function fill(template: string, values: Record<string, string | number>) {
	return template.replace(/\{(\w+)\}/g, (match, name: string) =>
		name in values ? String(values[name]) : match,
	);
}

/**
 * The settings editor of `select`, `radio` and `checkboxes`: their Options as
 * an ordered list of Label and Key (ADR-0028), and — for select alone, which
 * passes `offerMultiple` — the Multiple toggle.
 *
 * - **A Key is suggested from its Label.** A new Option's Key follows its
 *   Label (`optionKeyFromLabel`) until the Author edits the Key by hand; an
 *   Option already stored never has its Key re-derived, since Content holds
 *   it.
 * - **Invalid rows are shown inline**, from the rules `validateSpec` applies
 *   on save. A row still entirely blank is just being added, and says
 *   nothing yet; saving it is still refused.
 * - The rows are the stored list, index for index, so an error's path and its
 *   row agree; an entry that is not an Option reads as a blank row.
 *
 * Reordering Options and fixing a released Option's Key are left to later
 * work (fieldkit#364, #365); a row is laid out so either slots in.
 */
export function ChoiceSettingsEditor({
	settings,
	onChange,
	offerMultiple = false,
}: SettingsProps<ChoiceSettings> & { offerMultiple?: boolean }) {
	const labels = useContext(ChoiceSettingsLabelsContext);
	const optionsLock = useSettingLock("options");
	const multipleLock = useSettingLock("multiple");

	// Read as stored, not as typed: a hand-written Spec may hold anything.
	const raw: unknown = settings?.options;
	const stored: unknown[] = Array.isArray(raw) ? raw : [];
	const rows = stored.map(toRow);
	const errors = rowErrors(stored);

	// Which rows' Keys still follow their Label, by index. Held against the
	// list this editor last wrote: any other list — a Discard, another Field,
	// a list it never wrote — follows nothing, so no stored Key is ever
	// re-derived.
	const follow = useRef<{ list: unknown[] | null; rows: boolean[] }>({
		list: null,
		rows: [],
	});
	const following =
		follow.current.list === raw ? follow.current.rows : stored.map(() => false);

	function write(next: unknown[], nextFollowing: boolean[]) {
		follow.current = { list: next, rows: nextFollowing };
		// The rows are the stored list index for index, invalid entries
		// included, so what is written is what validateSpec will judge.
		onChange({ ...settings, options: next as ChoiceOption[] });
	}

	function updateRow(index: number, patch: Partial<ChoiceOption>) {
		const entry = stored[index];
		const base =
			typeof entry === "object" && entry !== null && !Array.isArray(entry)
				? (entry as Record<string, unknown>)
				: {};
		const next = stored.map((e, i) =>
			i === index ? { ...base, ...rows[i], ...patch } : e,
		);
		return next;
	}

	function setLabel(index: number, label: string) {
		const patch: Partial<ChoiceOption> = { label };
		if (following[index]) patch.key = optionKeyFromLabel(label);
		write(updateRow(index, patch), following);
	}

	function setKey(index: number, key: string) {
		write(
			updateRow(index, { key }),
			following.map((f, i) => (i === index ? false : f)),
		);
	}

	function add() {
		write([...stored, { key: "", label: "" }], [...following, true]);
	}

	function remove(index: number) {
		write(
			stored.filter((_, i) => i !== index),
			following.filter((_, i) => i !== index),
		);
	}

	return (
		<Stack gap="4">
			<Box data-testid="choice-options">
				<Text fontSize="xs" fontWeight="medium" color="fg.muted">
					{labels.choiceOptions}
				</Text>
				{rows.length === 0 ? (
					<Text
						fontSize="sm"
						color="fg.muted"
						mt="1"
						data-testid="choice-options-empty"
					>
						{labels.choiceOptionsEmpty}
					</Text>
				) : (
					<Stack gap="2" mt="1">
						{rows.map((row, index) => {
							const n = index + 1;
							const blank = row.key === "" && row.label === "";
							const rowError = blank ? undefined : errors.get(index);
							return (
								<Box
									// biome-ignore lint/suspicious/noArrayIndexKey: an Option's Key is what the Author edits, so the index is its only stable identity
									key={index}
									data-testid={`choice-option-${index}`}
								>
									<Flex gap="1" align="center">
										<Input
											size="sm"
											flex="3"
											value={row.label}
											placeholder={labels.choiceOptionLabel}
											aria-label={fill(labels.choiceOptionLabelOf, { n })}
											aria-invalid={rowError?.label ? true : undefined}
											borderColor={rowError?.label ? "danger.600" : undefined}
											disabled={optionsLock.locked}
											onChange={(e) => setLabel(index, e.target.value)}
											data-testid={`choice-option-${index}-label`}
										/>
										<Input
											size="sm"
											flex="2"
											fontFamily="mono"
											value={row.key}
											placeholder={labels.choiceOptionKey}
											aria-label={fill(labels.choiceOptionKeyOf, { n })}
											aria-invalid={rowError?.key ? true : undefined}
											borderColor={rowError?.key ? "danger.600" : undefined}
											disabled={optionsLock.locked}
											onChange={(e) => setKey(index, e.target.value)}
											data-testid={`choice-option-${index}-key`}
										/>
										<IconButton
											aria-label={fill(labels.choiceOptionRemove, { n })}
											size="xs"
											variant="ghost"
											disabled={optionsLock.locked}
											onClick={() => remove(index)}
											data-testid={`choice-option-${index}-remove`}
										>
											<X size={14} />
										</IconButton>
									</Flex>
									{rowError?.label && (
										<Text
											fontSize="xs"
											color="danger.600"
											mt="1"
											data-testid={`choice-option-${index}-label-error`}
										>
											{labels.choiceOptionErrorLabel}
										</Text>
									)}
									{rowError?.key && (
										<Text
											fontSize="xs"
											color="danger.600"
											mt="1"
											data-testid={`choice-option-${index}-key-error`}
										>
											{rowError.key === "duplicate"
												? fill(labels.choiceOptionErrorDuplicateKey, {
														key: row.key,
													})
												: labels.choiceOptionErrorKey}
										</Text>
									)}
								</Box>
							);
						})}
					</Stack>
				)}
				<Button
					size="xs"
					variant="ghost"
					mt="1"
					disabled={optionsLock.locked}
					onClick={add}
					data-testid="choice-option-add"
				>
					<Plus size={14} />
					{labels.choiceOptionAdd}
				</Button>
				<SettingLockReason lock={optionsLock} />
			</Box>
			{offerMultiple && (
				<Box>
					<Box as="label" display="flex" alignItems="center" gap="2">
						<input
							type="checkbox"
							checked={settings?.multiple === true}
							disabled={multipleLock.locked}
							onChange={(e) =>
								onChange({ ...settings, multiple: e.target.checked })
							}
							data-testid="choice-multiple"
						/>
						<Text fontSize="sm">{labels.choiceMultiple}</Text>
					</Box>
					<SettingLockReason lock={multipleLock} />
				</Box>
			)}
		</Stack>
	);
}
ChoiceSettingsEditor.displayName = "ChoiceSettingsEditor";

/** select's settings editor: the shared one, with the Multiple toggle. */
export function SelectSettingsEditor(props: SettingsProps<ChoiceSettings>) {
	return <ChoiceSettingsEditor {...props} offerMultiple />;
}
SelectSettingsEditor.displayName = "SelectSettingsEditor";
