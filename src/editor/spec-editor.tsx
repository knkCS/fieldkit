// src/editor/spec-editor.tsx
import { Box, Flex, Stack } from "@chakra-ui/react";
import { Button, DirtyDot } from "@knkcs/anker/atoms";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { Alert, Toaster, Tooltip, toaster } from "@knkcs/anker/primitives";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { mergeLabels } from "../renderer/merge-labels";
import type {
	FieldContext,
	FieldTypeCategory,
	FieldTypePlugin,
} from "../schema/plugin";
import type { Field, Schema } from "../schema/types";
import type { SpecFieldError } from "../schema/validate-spec";
import { insertFieldAt, updateField } from "./draft-ops";
import { EditorCanvas } from "./editor-canvas";
import { FieldConfigPanel } from "./field-config-panel";
import { TryItView } from "./try-it-view";
import { useSpecDraft } from "./use-spec-draft";

export interface EditorLabels {
	// canvas / SpecForm passthrough
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
	/** §10 optional marker for canvas previews and Try-it (pass-through to
	 * SpecForm's `optionalMarker`). */
	optionalMarker?: string;
	/** Accessible name for a canvas tab's error badge; "{count}" interpolated. */
	tabErrors?: string;
	/** Accessible name for a canvas tab's error badge at count 1. */
	tabErrorsOne?: string;
	/** Accessible name for the field-search input (canvas/Try-it). */
	searchLabel?: string;
	/** aria-label for per-field + tab dirty dots (canvas/Try-it); the header
	 * dot uses `dirty`. */
	unsavedChanges?: string;
	hiddenField?: string; // e.g. "Hidden field:" prefix
	groupPreview?: string; // e.g. "Repeating group" — child count appended
	addField?: string; // aria-label for the ⊕ insertion trigger
	emptySpec?: string; // empty-spec placeholder message
	// type picker (search + category headings + at-max explanation)
	typeSearchPlaceholder?: string;
	typeSearchLabel?: string;
	typeNoMatches?: string;
	/** Tooltip/title on disabled at-max cards; "{max}" interpolated. */
	typeMaxReached?: string;
	typeCategories?: Partial<Record<FieldTypeCategory, string>>;
	// header
	save?: string;
	discard?: string;
	build?: string;
	tryIt?: string;
	fixValidationFirst?: string;
	saveFailed?: string;
	dirty?: string; // aria-label for the header's dirty indicator dot
	// try-it
	testSubmit?: string;
	testSubmitSuccess?: string;
	// sections
	addSection?: string;
	newSectionName?: string;
	sectionNameInput?: string;
	renameSection?: string;
	moveLeft?: string;
	moveRight?: string;
	deleteSection?: string;
	deleteSectionConfirm?: string; // "{section}" interpolated
	orientationH?: string;
	orientationV?: string;
	sectionMenu?: string; // "{section}" interpolated aria
	moveToSection?: string;
	// shell toolbar
	dragField?: string;
	editField?: string;
	duplicateField?: string;
	deleteField?: string;
	systemLocked?: string;
	// delete undo
	fieldDeleted?: string;
	undo?: string;
	// panel
	panelGeneral?: string;
	panelValidation?: string;
	panelTypeSettings?: string;
	panelNoSettings?: string;
	panelChildren?: string;
	panelBack?: string;
	panelClose?: string;
	panelLocalizable?: string;
	accessorInUse?: string;
	accessorEmpty?: string;
	committedAccessorWarning?: string;
	/**
	 * Flagged addition beyond the T12 brief's literal EditorLabels snippet:
	 * FieldConfigPanel's PanelLabels (T9, binding) requires a non-optional
	 * `editChild` label for the group-children list's per-row Edit button.
	 * The brief's EditorLabels omits it; without it here this component
	 * cannot build a valid PanelLabels object.
	 */
	editChild?: string;
	/**
	 * Final-review batch: ConfigSection's and ValidationSection's control
	 * labels (Name, Accessor, Required, Instructions, Default value, Hidden,
	 * Read only, Min length, Max length, Pattern, Pattern message, Unique)
	 * were hardcoded English despite the project's "every author-facing
	 * string routes through labels" rule — these route through PanelLabels
	 * like every other panel string.
	 */
	name?: string;
	accessor?: string;
	required?: string;
	instructions?: string;
	defaultValue?: string;
	hidden?: string;
	readOnly?: string;
	minLength?: string;
	maxLength?: string;
	pattern?: string;
	patternMessage?: string;
	unique?: string;
	/**
	 * Toast title shown when a background `schema` prop change arrives while
	 * the draft is dirty (Amendment 3's "conflict notice" — the draft is kept,
	 * but the author must be warned that Save will overwrite the incoming
	 * content).
	 */
	baselineConflict?: string;
	// validation messages by SpecFieldErrorCode ("{accessor}" interpolated)
	errorDuplicateAccessor?: string;
	errorEmptyName?: string;
	errorEmptyAccessor?: string;
}

export const DEFAULT_EDITOR_LABELS: Required<EditorLabels> = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
	optionalMarker: "(optional)",
	tabErrors: "{count} invalid fields",
	tabErrorsOne: "1 invalid field",
	searchLabel: "Find field",
	unsavedChanges: "Unsaved changes",
	hiddenField: "Hidden field:",
	groupPreview: "Repeating group",
	addField: "Add field",
	emptySpec: "No fields yet. Add the first one:",

	typeSearchPlaceholder: "Search field types...",
	typeSearchLabel: "Search field types",
	typeNoMatches: "No matching field types",
	typeMaxReached: "Limit reached (max {max})",
	typeCategories: {
		text: "Text",
		number: "Number",
		date: "Date",
		selection: "Selection",
		boolean: "Boolean",
		structural: "Structural",
		reference: "Reference",
		media: "Media",
	},

	save: "Save",
	discard: "Discard",
	build: "Build",
	tryIt: "Try it",
	fixValidationFirst: "Fix validation errors before trying the form",
	saveFailed: "Save failed",
	dirty: "Unsaved changes",

	testSubmit: "Test submit",
	testSubmitSuccess: "Form submitted successfully",

	addSection: "+ Section",
	newSectionName: "New section",
	sectionNameInput: "Section name",
	renameSection: "Rename",
	moveLeft: "Move left",
	moveRight: "Move right",
	deleteSection: "Delete section",
	deleteSectionConfirm:
		'Delete section "{section}"? Its fields move to the previous tab.',
	orientationH: "Horizontal tabs",
	orientationV: "Vertical tabs",
	sectionMenu: "Section menu: {section}",
	moveToSection: "Move to section",

	dragField: "Drag to reorder",
	editField: "Edit field",
	duplicateField: "Duplicate field",
	deleteField: "Delete field",
	systemLocked: "System field",

	fieldDeleted: "Field deleted",
	undo: "Undo",

	panelGeneral: "General",
	panelValidation: "Validation",
	panelTypeSettings: "Type settings",
	panelNoSettings: "No additional settings",
	panelChildren: "Children",
	panelBack: "Back",
	panelClose: "Close",
	panelLocalizable: "Localizable",
	accessorInUse: "This accessor is already in use",
	accessorEmpty: "Accessor is required",
	committedAccessorWarning:
		"Changing the accessor of a saved field disconnects its existing data",
	editChild: "Edit",

	name: "Name",
	accessor: "Accessor",
	required: "Required",
	instructions: "Instructions",
	defaultValue: "Default value",
	hidden: "Hidden",
	readOnly: "Read only",
	minLength: "Min length",
	maxLength: "Max length",
	pattern: "Pattern (regex)",
	patternMessage: "Pattern message",
	unique: "Unique",

	baselineConflict:
		"The saved specification changed in the background. Saving will overwrite it.",

	errorDuplicateAccessor: 'Duplicate accessor "{accessor}"',
	errorEmptyName: "Name must not be empty",
	errorEmptyAccessor: "Accessor must not be empty",
};

/** Maps a SpecFieldError's code to its labeled, `{accessor}`-interpolated
 * message — the single place validate-spec's internal codes become
 * author-facing text (its raw `.message` is English-only and untranslated). */
function translateFieldError(
	error: SpecFieldError,
	labels: Required<EditorLabels>,
): SpecFieldError {
	const template =
		error.code === "duplicate_accessor"
			? labels.errorDuplicateAccessor
			: error.code === "empty_name"
				? labels.errorEmptyName
				: labels.errorEmptyAccessor;
	return { ...error, message: template.replace("{accessor}", error.accessor) };
}

/** Every accessor committed anywhere in the schema, including group
 * children at every nesting level — a flat top-level-only scan would miss
 * committed children and let their auto-slug latch start ACTIVE. */
function collectAccessorsRecursively(fields: Schema, into: Set<string>): void {
	for (const field of fields) {
		into.add(field.config.api_accessor);
		if (field.children) collectAccessorsRecursively(field.children, into);
	}
}

export interface SpecEditorProps {
	schema: Schema;
	/** Called with the draft on Save. May return a Promise — a rejection
	 * keeps the draft dirty and surfaces a `saveFailed` toast. */
	onCommit: (schema: Schema) => void | Promise<void>;
	onDirtyChange?: (dirty: boolean) => void;
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	/** Header left slot, beside the dirty indicator. Flagged spec addition. */
	title?: ReactNode;
	labels?: EditorLabels;
}

export function SpecEditor({
	schema,
	onCommit,
	onDirtyChange,
	plugins,
	context,
	title,
	labels,
}: SpecEditorProps) {
	const mergedLabels = useMemo<Required<EditorLabels>>(
		() => mergeLabels(DEFAULT_EDITOR_LABELS, labels),
		[labels],
	);

	const spec = useSpecDraft(schema, plugins, onCommit, onDirtyChange);
	const [mode, setMode] = useState<"build" | "tryit">("build");
	const [selected, setSelected] = useState<string | null>(null);
	const [autoFocusLabel, setAutoFocusLabel] = useState(false);
	const [tryItNonce, setTryItNonce] = useState(0);

	// autoFocusLabel is a PULSE: reset right after so the NEXT Edit produces a
	// fresh rising edge in the panel even without it unmounting in between.
	useEffect(() => {
		if (autoFocusLabel) setAutoFocusLabel(false);
	}, [autoFocusLabel]);

	// Toast on a NEW save failure only (not on every render while saveError
	// stays set) — the draft stays dirty (useSpecDraft's guarantee), so the
	// author can just retry.
	const lastSaveErrorRef = useRef<unknown | null>(null);
	useEffect(() => {
		if (spec.saveError != null && spec.saveError !== lastSaveErrorRef.current) {
			toaster.create({ title: mergedLabels.saveFailed, type: "error" });
		}
		lastSaveErrorRef.current = spec.saveError;
	}, [spec.saveError, mergedLabels.saveFailed]);

	// Toast on the RISING EDGE of baselineConflict only (mirrors saveError
	// above) — it flips true once when a background schema change arrives
	// while dirty, and must not re-toast on every subsequent render while it
	// stays true.
	const lastBaselineConflictRef = useRef(false);
	useEffect(() => {
		if (spec.baselineConflict && !lastBaselineConflictRef.current) {
			toaster.create({
				title: mergedLabels.baselineConflict,
				type: "warning",
			});
		}
		lastBaselineConflictRef.current = spec.baselineConflict;
	}, [spec.baselineConflict, mergedLabels.baselineConflict]);

	// Escape, Build mode only: inner controls (an open popover/menu, or the
	// section rename input) stop propagation — or preventDefault — on their
	// own Escape handling, so this document-level listener never actually
	// sees those keydowns bubble up to it. The defaultPrevented check below is
	// an additional, belt-and-suspenders guard for any handler that prevents
	// default without also stopping propagation.
	useEffect(() => {
		if (mode !== "build") return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			setSelected(null);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [mode]);

	// The last COMMITTED spec (the `schema` prop), not the live draft — drives
	// the panel's disconnect warning and auto-slug latch baseline.
	const committedAccessors = useMemo(() => {
		const set = new Set<string>();
		collectAccessorsRecursively(schema, set);
		return set;
	}, [schema]);

	// CanvasLabels and PanelLabels are both Picks of EditorLabels using the
	// SAME flat key names (C8/C17) — mergedLabels (Required<EditorLabels>)
	// satisfies both structurally, so no per-key renaming/mapping is needed
	// here; each is just passed straight through as the `labels` prop below.

	const translatedFieldErrors = useMemo(
		() =>
			spec.validation.fieldErrors.map((e) =>
				translateFieldError(e, mergedLabels),
			),
		[spec.validation.fieldErrors, mergedLabels],
	);

	// F4: maxPerSpec violations land in `validation.errors` but NOT in
	// `fieldErrors` (there's no single field to blame — the constraint is on
	// the count of a whole field_type), so they were invisible: no shell
	// outline, no tab badge, just a disabled Save with no explanation. Every
	// fieldErrors message is duplicated verbatim into `errors` too, so
	// filtering those out isolates exactly the non-field (maxPerSpec)
	// messages that still need a home.
	const nonFieldErrors = useMemo(() => {
		const fieldErrorMessages = new Set(
			spec.validation.fieldErrors.map((e) => e.message),
		);
		return spec.validation.errors.filter((msg) => !fieldErrorMessages.has(msg));
	}, [spec.validation]);

	const selectedField: Field | null =
		(selected != null
			? (spec.draft.find((f) => f.config.api_accessor === selected) ?? null)
			: null) ?? null;

	function handleSelect(accessor: string | null) {
		setSelected(accessor);
		setAutoFocusLabel(false);
	}

	function handleEdit(accessor: string) {
		setSelected(accessor);
		setAutoFocusLabel(true);
	}

	// Draft-accessor -> last-COMMITTED accessor for fields renamed this
	// session. The config panel's committed-accessor disconnect warning
	// compares against this baseline; without it, deselect/reselect
	// re-baselines to the draft accessor (the panel's own local state is
	// freshly initialized on every remount) and the warning vanishes
	// mid-rename. Cleared on a successful save and on discard — see the
	// `spec.dirty` falling-edge effect and `handleDiscard` below.
	const renameBaselinesRef = useRef(new Map<string, string>());

	// `dirty` goes true→false in exactly two cases: a successful save
	// (useSpecDraft's baseline catches up to draft) or an explicit Discard
	// (which also clears the map directly, below — redundant but harmless
	// here). Either way, no in-session rename remains to disconnect-warn
	// about once nothing is dirty, so the map is stale and must be cleared.
	const wasDirtyRef = useRef(spec.dirty);
	useEffect(() => {
		if (wasDirtyRef.current && !spec.dirty) {
			renameBaselinesRef.current.clear();
		}
		wasDirtyRef.current = spec.dirty;
	}, [spec.dirty]);

	function handlePanelFieldChange(next: Field) {
		if (selected == null) return;
		// Functional-updater form: applies against whatever the draft is AT
		// APPLY TIME, not the `spec.draft` closed over when this handler was
		// (re)created — avoids depending on a live-draft ref.
		spec.apply((draft) => updateField(draft, selected, next));
		// The panel's local collision gate already guarantees uniqueness, so a
		// changed accessor here is unambiguous — follow the selection to it.
		if (next.config.api_accessor !== selected) {
			const baselines = renameBaselinesRef.current;
			const base = baselines.get(selected) ?? selected;
			baselines.delete(selected);
			if (base === next.config.api_accessor) {
				// Renamed back to its committed accessor — no disconnect.
				baselines.delete(next.config.api_accessor);
			} else {
				baselines.set(next.config.api_accessor, base);
			}
			setSelected(next.config.api_accessor);
		}
	}

	// Single-level, best-effort undo: if the draft's shape changed since the
	// delete (further edits happened before Undo was clicked), insertFieldAt
	// clamps the index rather than throwing — acceptable for a v1 undo.
	function handleDeleteField(field: Field, flatIndex: number) {
		// A deleted field's rename-baseline entry (if it had one) is now stale —
		// its accessor no longer exists in the draft to disconnect-warn about.
		// If Undo below re-inserts the field, it comes back with its PRE-delete
		// (i.e. current, possibly already-renamed) accessor and no baseline
		// entry — equivalent to the field's rename tracking resetting at delete
		// time, which is acceptable: the alternative (preserving a rename
		// baseline through a delete/undo round trip) isn't a case the map was
		// ever designed to survive.
		renameBaselinesRef.current.delete(field.config.api_accessor);
		toaster.create({
			title: mergedLabels.fieldDeleted,
			type: "info",
			action: {
				label: mergedLabels.undo,
				// Functional-updater form: the toast's onClick fires well after
				// this closure was created, so it must apply against the draft
				// AT UNDO TIME (which may have advanced past the deletion), not
				// whatever `spec.draft` was when the toast was scheduled.
				onClick: () => {
					spec.apply((draft) => insertFieldAt(draft, field, flatIndex));
					// Restore the panel context the delete destroyed.
					setSelected(field.config.api_accessor);
				},
			},
		});
	}

	function handleEnterTryIt() {
		if (!spec.validation.valid) return;
		// Nonce bump forces TryItView to remount on every entry, so scratch
		// data typed in a previous Try-it visit can never survive an exit.
		setTryItNonce((n) => n + 1);
		setMode("tryit");
	}

	function handleDiscard() {
		spec.discard();
		setSelected(null);
		// A Try-it view mounted against the pre-discard draft would keep its
		// scratch values; remount it against the reset draft.
		setTryItNonce((n) => n + 1);
		renameBaselinesRef.current.clear();
	}

	const tryItButton = (
		<Button
			variant={mode === "tryit" ? "solid" : "ghost"}
			size="sm"
			disabled={!spec.validation.valid}
			onClick={handleEnterTryIt}
		>
			{mergedLabels.tryIt}
		</Button>
	);

	return (
		<ConfirmModalProvider>
			<Box data-testid="spec-editor" display="flex" flexDirection="column">
				<Toaster />
				<Flex
					as="header"
					align="center"
					justify="space-between"
					borderBottomWidth="1px"
					bg="bg-subtle"
					p="2"
				>
					<Flex align="center" gap="2">
						{title}
						<DirtyDot active={spec.dirty} label={mergedLabels.dirty} />
					</Flex>
					<Flex align="center" gap="2">
						<Button
							variant={mode === "build" ? "solid" : "ghost"}
							size="sm"
							onClick={() => setMode("build")}
						>
							{mergedLabels.build}
						</Button>
						{spec.validation.valid ? (
							tryItButton
						) : (
							<Tooltip content={mergedLabels.fixValidationFirst}>
								{tryItButton}
							</Tooltip>
						)}
						<Button
							variant="outline"
							size="sm"
							disabled={!spec.dirty || spec.saving}
							onClick={handleDiscard}
						>
							{mergedLabels.discard}
						</Button>
						<Button
							variant="solid"
							size="sm"
							disabled={!spec.dirty || !spec.validation.valid || spec.saving}
							loading={spec.saving}
							onClick={() => spec.save()}
						>
							{mergedLabels.save}
						</Button>
					</Flex>
				</Flex>

				{nonFieldErrors.length > 0 && (
					<Stack gap="1" p="2">
						{nonFieldErrors.map((message) => (
							// TODO(fieldkit#27): these are validateSpec's raw, English-only
							// message strings, not routed through EditorLabels — unlike
							// fieldErrors' codes, maxPerSpec violations aren't translatable
							// yet. Sanctioned deviation from the "all strings via labels"
							// rule for this one surface until that lands.
							<Alert
								key={message}
								role="alert"
								status="warning"
								title={message}
							/>
						))}
					</Stack>
				)}

				{mode === "tryit" ? (
					<TryItView
						key={tryItNonce}
						schema={spec.draft}
						plugins={plugins}
						labels={{
							testSubmit: mergedLabels.testSubmit,
							testSubmitSuccess: mergedLabels.testSubmitSuccess,
							defaultTab: mergedLabels.defaultTab,
							searchPlaceholder: mergedLabels.searchPlaceholder,
							noResults: mergedLabels.noResults,
							optionalMarker: mergedLabels.optionalMarker,
							tabErrors: mergedLabels.tabErrors,
							searchLabel: mergedLabels.searchLabel,
							tabErrorsOne: mergedLabels.tabErrorsOne,
							unsavedChanges: mergedLabels.unsavedChanges,
						}}
					/>
				) : (
					<Flex align="stretch">
						<Box flex="1" minWidth="0">
							<EditorCanvas
								spec={spec}
								plugins={plugins}
								context={context}
								selectedAccessor={selected}
								onSelect={handleSelect}
								onEdit={handleEdit}
								onDeleteField={handleDeleteField}
								labels={mergedLabels}
							/>
						</Box>
						{selectedField && (
							<FieldConfigPanel
								field={selectedField}
								plugin={spec.pluginMap.get(selectedField.field_type)}
								draft={spec.draft}
								fieldErrors={translatedFieldErrors}
								onFieldChange={handlePanelFieldChange}
								onClose={() => handleSelect(null)}
								autoFocusLabel={autoFocusLabel}
								committedAccessors={committedAccessors}
								baselineAccessor={
									selected != null
										? (renameBaselinesRef.current.get(selected) ?? selected)
										: ""
								}
								labels={mergedLabels}
							/>
						)}
					</Flex>
				)}
			</Box>
		</ConfirmModalProvider>
	);
}
SpecEditor.displayName = "SpecEditor";
