// src/editor/spec-editor.tsx
import { Box, Flex } from "@chakra-ui/react";
import { Button, DirtyDot } from "@knkcs/anker/atoms";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { Toaster, Tooltip, toaster } from "@knkcs/anker/primitives";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { FieldContext, FieldTypePlugin } from "../schema/plugin";
import type { Field, Schema } from "../schema/types";
import type { SpecFieldError } from "../schema/validate-spec";
import { insertFieldAt, updateField } from "./draft-ops";
import { EditorCanvas, type EditorCanvasProps } from "./editor-canvas";
import { FieldConfigPanel, type PanelLabels } from "./field-config-panel";
import { TryItView } from "./try-it-view";
import { useSpecDraft } from "./use-spec-draft";

/** The canvas's labels shape isn't exported by name (`CanvasLabels` is an
 * internal interface in editor-canvas.tsx) — extracted structurally instead
 * of widening that module's export surface just for this one type alias. */
type CanvasLabels = EditorCanvasProps["labels"];

export interface EditorLabels {
	// canvas / SpecForm passthrough
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
	hiddenField?: string; // e.g. "Hidden field:" prefix
	groupPreview?: string; // e.g. "Repeating group" — child count appended
	addField?: string; // aria-label for the ⊕ insertion trigger
	emptySpec?: string; // empty-spec placeholder message
	// header
	save?: string;
	discard?: string;
	build?: string;
	tryIt?: string;
	fixValidationFirst?: string;
	saveFailed?: string;
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
	// validation messages by SpecFieldErrorCode ("{accessor}" interpolated)
	errorDuplicateAccessor?: string;
	errorEmptyName?: string;
	errorEmptyAccessor?: string;
}

export const DEFAULT_EDITOR_LABELS: Required<EditorLabels> = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
	hiddenField: "Hidden field:",
	groupPreview: "Repeating group",
	addField: "Add field",
	emptySpec: "No fields yet. Add the first one:",

	save: "Save",
	discard: "Discard",
	build: "Build",
	tryIt: "Try it",
	fixValidationFirst: "Fix validation errors before trying the form",
	saveFailed: "Save failed",

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
	onCommit: (schema: Schema) => void;
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
		() => ({ ...DEFAULT_EDITOR_LABELS, ...labels }),
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

	// Undo (below) needs the LIVE draft at click time, not the one captured
	// when the toast was created — by the time Undo is clicked, the draft has
	// already advanced past the deletion (and possibly further edits).
	const draftRef = useRef<Schema>(spec.draft);
	useEffect(() => {
		draftRef.current = spec.draft;
	}, [spec.draft]);

	// Escape, Build mode only: a popover/menu/rename-input that handles its
	// own Escape marks the event defaultPrevented — this must not ALSO clear
	// the selection underneath it.
	useEffect(() => {
		if (mode !== "build") return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			setSelected(null);
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [mode]);

	const pluginMap = useMemo(
		() => new Map(plugins.map((p) => [p.id, p])),
		[plugins],
	);

	// The last COMMITTED spec (the `schema` prop), not the live draft — drives
	// the panel's disconnect warning and auto-slug latch baseline.
	const committedAccessors = useMemo(() => {
		const set = new Set<string>();
		collectAccessorsRecursively(schema, set);
		return set;
	}, [schema]);

	const canvasLabels: CanvasLabels = useMemo(
		() => ({
			defaultTab: mergedLabels.defaultTab,
			searchPlaceholder: mergedLabels.searchPlaceholder,
			noResults: mergedLabels.noResults,
			hiddenField: mergedLabels.hiddenField,
			groupPreview: mergedLabels.groupPreview,
			addField: mergedLabels.addField,
			emptySpec: mergedLabels.emptySpec,
			moveToSection: mergedLabels.moveToSection,
			renameSection: mergedLabels.renameSection,
			moveLeft: mergedLabels.moveLeft,
			moveRight: mergedLabels.moveRight,
			deleteSection: mergedLabels.deleteSection,
			deleteSectionConfirm: mergedLabels.deleteSectionConfirm,
			orientationH: mergedLabels.orientationH,
			orientationV: mergedLabels.orientationV,
			sectionMenu: mergedLabels.sectionMenu,
			addSection: mergedLabels.addSection,
			newSectionName: mergedLabels.newSectionName,
			sectionNameInput: mergedLabels.sectionNameInput,
			shell: {
				drag: mergedLabels.dragField,
				edit: mergedLabels.editField,
				duplicate: mergedLabels.duplicateField,
				delete: mergedLabels.deleteField,
				systemLocked: mergedLabels.systemLocked,
			},
		}),
		[mergedLabels],
	);

	const panelLabels: PanelLabels = useMemo(
		() => ({
			general: mergedLabels.panelGeneral,
			validation: mergedLabels.panelValidation,
			typeSettings: mergedLabels.panelTypeSettings,
			noSettings: mergedLabels.panelNoSettings,
			children: mergedLabels.panelChildren,
			back: mergedLabels.panelBack,
			close: mergedLabels.panelClose,
			localizable: mergedLabels.panelLocalizable,
			accessorInUse: mergedLabels.accessorInUse,
			accessorEmpty: mergedLabels.accessorEmpty,
			committedAccessorWarning: mergedLabels.committedAccessorWarning,
			editChild: mergedLabels.editChild,
		}),
		[mergedLabels],
	);

	const translatedFieldErrors = useMemo(
		() =>
			spec.validation.fieldErrors.map((e) =>
				translateFieldError(e, mergedLabels),
			),
		[spec.validation.fieldErrors, mergedLabels],
	);

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

	function handlePanelFieldChange(next: Field) {
		if (selected == null) return;
		spec.apply(updateField(spec.draft, selected, next));
		// The panel's local collision gate already guarantees uniqueness, so a
		// changed accessor here is unambiguous — follow the selection to it.
		if (next.config.api_accessor !== selected) {
			setSelected(next.config.api_accessor);
		}
	}

	// Single-level, best-effort undo: if the draft's shape changed since the
	// delete (further edits happened before Undo was clicked), insertFieldAt
	// clamps the index rather than throwing — acceptable for a v1 undo.
	function handleDeleteField(field: Field, flatIndex: number) {
		toaster.create({
			title: mergedLabels.fieldDeleted,
			type: "info",
			action: {
				label: mergedLabels.undo,
				onClick: () =>
					spec.apply(insertFieldAt(draftRef.current, field, flatIndex)),
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
						<DirtyDot active={spec.dirty} />
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

				{mode === "tryit" ? (
					<TryItView
						key={tryItNonce}
						schema={spec.draft}
						plugins={plugins}
						labels={{
							testSubmit: mergedLabels.testSubmit,
							testSubmitSuccess: mergedLabels.testSubmitSuccess,
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
								labels={canvasLabels}
							/>
						</Box>
						{selectedField && (
							<FieldConfigPanel
								field={selectedField}
								plugin={pluginMap.get(selectedField.field_type)}
								draft={spec.draft}
								fieldErrors={translatedFieldErrors}
								onFieldChange={handlePanelFieldChange}
								onClose={() => handleSelect(null)}
								autoFocusLabel={autoFocusLabel}
								committedAccessors={committedAccessors}
								labels={panelLabels}
							/>
						)}
					</Flex>
				)}
			</Box>
		</ConfirmModalProvider>
	);
}
SpecEditor.displayName = "SpecEditor";
