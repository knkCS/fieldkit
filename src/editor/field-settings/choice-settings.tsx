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
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
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
	choiceOptionReorder: string;
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
	choiceOptionReorder: "Reorder option {n}",
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
 * - **Options reorder by their grip** — dragged, or from the keyboard (Space
 *   lifts, arrows move, Space drops, Escape cancels), dnd-kit's sensors as the
 *   canvas uses them (`docs/dnd-kit-reference.md`). List order is display
 *   order (ADR-0028), so a move is written straight into the stored list.
 *
 * Fixing a released Option's Key is left to later work (fieldkit#365).
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

	// Which rows' Keys still follow their Label, and each row's drag id, by
	// index. Held against the list this editor last wrote: any other list — a
	// Discard, another Field, a list it never wrote — follows nothing, so no
	// stored Key is ever re-derived, and gets fresh ids. The ids are what a
	// move carries a row's identity by: an Option's Key is what the Author
	// edits, so it cannot be one, and an index changes with the move itself.
	const follow = useRef<{
		list: unknown;
		rows: boolean[];
		ids: string[];
		nextId: number;
	}>({ list: null, rows: [], ids: [], nextId: 0 });
	const mint = () => `option-${follow.current.nextId++}`;
	if (follow.current.list !== raw) {
		// Recorded during render so the ids stay put until the list changes;
		// writing the same list twice (StrictMode) records the same thing.
		// Minted before the record is built: spreading the old record first
		// would copy the counter from before these ids took their numbers.
		const fresh = stored.map(mint);
		follow.current = {
			...follow.current,
			list: raw,
			rows: stored.map(() => false),
			ids: fresh,
		};
	}
	const { rows: following, ids } = follow.current;

	function write(next: unknown[], nextFollowing: boolean[], nextIds: string[]) {
		follow.current = {
			...follow.current,
			list: next,
			rows: nextFollowing,
			ids: nextIds,
		};
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
		write(updateRow(index, patch), following, ids);
	}

	function setKey(index: number, key: string) {
		write(
			updateRow(index, { key }),
			following.map((f, i) => (i === index ? false : f)),
			ids,
		);
	}

	function add() {
		write(
			[...stored, { key: "", label: "" }],
			[...following, true],
			[...ids, mint()],
		);
	}

	function remove(index: number) {
		write(
			stored.filter((_, i) => i !== index),
			following.filter((_, i) => i !== index),
			ids.filter((_, i) => i !== index),
		);
	}

	// Moves the row and everything held for it by index, so a Key that was
	// following its Label still does in its new place.
	function move(from: number, to: number) {
		write(
			arrayMove(stored, from, to),
			arrayMove(following, from, to),
			arrayMove(ids, from, to),
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
					<SortableOptionList ids={ids} onMove={move}>
						{rows.map((row, index) => {
							const n = index + 1;
							const blank = row.key === "" && row.label === "";
							const rowError = blank ? undefined : errors.get(index);
							return (
								<SortableOptionRow
									key={ids[index]}
									id={ids[index]}
									disabled={optionsLock.locked}
									gripLabel={fill(labels.choiceOptionReorder, { n })}
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
								</SortableOptionRow>
							);
						})}
					</SortableOptionList>
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

/**
 * The Options as one sortable column: the canvas's sensors (a pointer lifts
 * after 8px, so a click on the grip is a click; Space lifts from the keyboard,
 * arrows move, Space drops, Escape cancels) and the stock vertical strategy —
 * the rows are short and alike, so plain displacement is the feedback and no
 * overlay is needed (`docs/dnd-kit-reference.md`).
 */
function SortableOptionList({
	ids,
	onMove,
	children,
}: {
	ids: string[];
	onMove: (from: number, to: number) => void;
	children: ReactNode;
}) {
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// SpecEditor deselects the Field on a document-level Escape, which would
	// close this panel under a keyboard drag that Escape only means to cancel.
	// Its listener is older than dnd-kit's, so it runs first; marking the
	// Escape handled in the capture phase is what it yields to. No
	// stopPropagation: dnd-kit's own listener still needs the key.
	const [dragging, setDragging] = useState(false);
	useEffect(() => {
		if (!dragging) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") event.preventDefault();
		}
		window.addEventListener("keydown", onKeyDown, true);
		return () => window.removeEventListener("keydown", onKeyDown, true);
	}, [dragging]);

	function handleDragEnd({ active, over }: DragEndEvent) {
		setDragging(false);
		if (!over || active.id === over.id) return;
		const from = ids.indexOf(String(active.id));
		const to = ids.indexOf(String(over.id));
		if (from !== -1 && to !== -1) onMove(from, to);
	}

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={() => setDragging(true)}
			onDragCancel={() => setDragging(false)}
			onDragEnd={handleDragEnd}
		>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<Stack gap="2" mt="1">
					{children}
				</Stack>
			</SortableContext>
		</DndContext>
	);
}
SortableOptionList.displayName = "SortableOptionList";

/**
 * One Option row as a sortable item: the whole row is what is measured and
 * moved, the grip beside it is what lifts it. Only the grip carries the
 * listeners, so a Space typed into a Label is never a lift.
 */
function SortableOptionRow({
	id,
	disabled,
	gripLabel,
	children,
	"data-testid": testId,
}: {
	id: string;
	disabled: boolean;
	gripLabel: string;
	children: ReactNode;
	"data-testid": string;
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id, disabled });
	return (
		<Flex
			ref={setNodeRef}
			// A single column: the sideways part of a drag means nothing.
			style={{
				transform: CSS.Translate.toString(transform && { ...transform, x: 0 }),
				transition,
			}}
			gap="1"
			align="start"
			position="relative"
			zIndex={isDragging ? 1 : undefined}
			bg={isDragging ? "bg.panel" : undefined}
			data-choice-option-row=""
			data-dragging={isDragging ? "true" : undefined}
			data-testid={testId}
		>
			{/* mt centres the xs grip on the sm inputs' first line, and keeps it
			    there when an error line grows the row below. */}
			<IconButton
				ref={setActivatorNodeRef}
				aria-label={gripLabel}
				size="xs"
				variant="ghost"
				mt="1"
				cursor={disabled ? undefined : "grab"}
				disabled={disabled}
				{...attributes}
				{...listeners}
			>
				<GripVertical size={14} />
			</IconButton>
			<Box flex="1" minW="0">
				{children}
			</Box>
		</Flex>
	);
}
SortableOptionRow.displayName = "SortableOptionRow";
