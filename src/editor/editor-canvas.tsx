// src/editor/editor-canvas.tsx
import { Box, Flex, Input, Stack, Text } from "@chakra-ui/react";
import {
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	type SortingStrategy,
	sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { IconButton } from "@knkcs/anker/atoms";
import { useConfirmModal } from "@knkcs/anker/feedback";
import { type FormMarkers, FormMarkersProvider } from "@knkcs/anker/forms";
import {
	MenuContent,
	MenuItem,
	MenuRoot,
	MenuTrigger,
	Tabs,
	Tooltip,
} from "@knkcs/anker/primitives";
import { FolderInput } from "lucide-react";
import {
	Fragment,
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { FormProvider, useForm } from "react-hook-form";
import { FieldComponent } from "../renderer/field-component";
import { formatCount } from "../renderer/merge-labels";
import { CardSurface } from "../renderer/spec-form/card-surface";
import { FieldSearch } from "../renderer/spec-form/field-search";
import { buildSearchIndex } from "../renderer/spec-form/search-index";
import { TabErrorBadge } from "../renderer/spec-form/tab-error-badge";
import { useContainerOrientation } from "../renderer/spec-form/use-container-orientation";
import { resolveMarkerConvention } from "../schema/marker-convention";
import { partitionTabByCards } from "../schema/partition-cards";
import type {
	FieldContext,
	FieldTypeCategory,
	FieldTypePlugin,
} from "../schema/plugin";
import type { Field } from "../schema/types";
import { getDefaultValues } from "../schema/zod-builder";
import { CardFrame } from "./card-frame";
import { CardMenu } from "./card-menu";
import {
	createField,
	deleteCardMerge,
	deleteCardWithFields,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertFieldAt,
	moveCard,
	moveField,
	moveFieldToSection,
	moveSection,
	removeFieldAt,
	renameSection,
	setOrientation,
	uniquifyAccessor,
} from "./draft-ops";
import {
	CardDragPreview,
	cardBlockFieldCount,
	ShellDragPreview,
} from "./drag-previews";
import { DropIndicatorLine } from "./drop-indicator";
import { FieldShell } from "./field-shell";
import {
	type ResolvedDropTarget,
	resolveDropTarget,
} from "./resolve-drop-target";
import type { SectionMenuLabels } from "./section-menu";
import { SectionMenu } from "./section-menu";
import type { EditorLabels } from "./spec-editor";
import type { TypePickerLabels } from "./type-picker";
import { TypePickerPopover } from "./type-picker-popover";
import type { SpecDraft } from "./use-spec-draft";
import { editorCollision } from "./visible-collision";

/** Droppable wrapper for a tab-trigger row — a cross-section drag target.
 * `highlighted` marks the RESOLVED cross-tab drop target mid-drag
 * (drag-feedback spec, Decision 3: highlight, no line): a background wash
 * only — never a border, which is the selection channel (Decision 4). */
function TabDropZone({
	tabIndex,
	highlighted,
	children,
}: {
	tabIndex: number;
	highlighted?: boolean;
	children: ReactNode;
}) {
	const { setNodeRef } = useDroppable({ id: `tabdrop-${tabIndex}` });
	return (
		<Box
			ref={setNodeRef}
			data-testid={`tabdrop-${tabIndex}`}
			data-drop-target={highlighted ? "true" : undefined}
			bg={highlighted ? "primary.subtle" : undefined}
			borderRadius="md"
		>
			{children}
		</Box>
	);
}
TabDropZone.displayName = "TabDropZone";

/** Drag-feedback rework (2026-07-14 spec, Decision 2 — "the list holds
 * still"): sortables get NO displacement transforms during a drag. The
 * DragOverlay carries the only moving element, so useSortable's transform
 * is `strategy(...)` for every non-active item — and for the active item
 * too once the overlay is measured (`shouldDisplaceDragSource` is false).
 * Returning null therefore leaves every real node untransformed, which
 * kills the frame-escape artifact (flat-strategy translations vs nested
 * card-frame DOM) structurally. Verified against the installed
 * @dnd-kit/sortable 8.0.0 useSortable source. */
const noopSortingStrategy: SortingStrategy = () => null;

/**
 * Flat EditorLabels key names throughout (including the field-shell toolbar
 * labels — dragField/editField/duplicateField/deleteField/viewField —
 * flattened directly onto this type instead of a nested `shell` sub-object)
 * so a host's merged EditorLabels satisfies this type structurally, with no
 * per-key renaming layer required at the call site.
 */
export interface CanvasLabels
	extends SectionMenuLabels,
		Pick<
			Required<EditorLabels>,
			| "defaultTab"
			| "searchPlaceholder"
			| "noResults"
			| "hiddenField" // e.g. "Hidden field:" prefix
			| "groupPreview" // e.g. "Repeating group" — child count appended
			| "addField" // aria-label for the ⊕ insertion trigger
			| "emptySpec" // empty-spec placeholder message
			| "dragField"
			| "editField"
			| "duplicateField"
			| "deleteField"
			| "viewField"
			| "moveToSection" // aria-label/tooltip for the "Move to section…" toolbar trigger
			// "{section}" interpolated — MUST say fields survive (move to the previous tab)
			| "deleteSectionConfirm"
			| "sectionMenu" // "{section}" interpolated — aria-label for the menu trigger
			| "sectionNameInput" // aria-label for the inline rename input
			| "cardUntitled" // italic placeholder title for unnamed cards
			| "dragCard" // card header drag handle aria-label (block move)
			| "cardMenu" // "{card}" interpolated — aria-label for the ⋯ trigger
			| "renameCard"
			| "deleteCardMerge" // marker-only delete; fields merge into a neighbor
			| "deleteCardWithFields"
			// "{card}" interpolated — destructive-confirm message
			| "deleteCardWithFieldsConfirm"
		> {
	// Type-picker passthrough (⊕ insertion popover). Kept optional here (unlike
	// the Required<EditorLabels> Pick above) so hosts driving EditorCanvas
	// directly with a hand-rolled CanvasLabels object — as the insertion test
	// suite does — aren't forced to supply them; TypePicker's own
	// DEFAULT_TYPE_PICKER_LABELS covers whatever's left undefined.
	typeSearchPlaceholder?: string;
	typeSearchLabel?: string;
	typeNoMatches?: string;
	typeMaxReached?: string;
	typeCategories?: Partial<Record<FieldTypeCategory, string>>;
	/** §10 optional marker for canvas previews; falls back to "(optional)". */
	optionalMarker?: string;
	/** Accessible name for a tab's error badge; "{count}" interpolated;
	 * falls back to "{count} invalid fields". */
	tabErrors?: string;
	/** Accessible name for a tab's error badge at count 1; falls back to
	 * "1 invalid field". */
	tabErrorsOne?: string;
	/** Count hint on the card block-drag overlay preview; "{count}"
	 * interpolated; falls back to "+ {count} fields". */
	cardDragFields?: string;
	/** Count hint at count 1; falls back to "+ 1 field". */
	cardDragFieldsOne?: string;
	/** Accessible name for the field-search input; falls back to
	 * "Find field". */
	searchLabel?: string;
	/** aria-label default for per-field dirty dots in canvas previews (inert
	 * today) and, via Try-it, the real form; the header dot uses `dirty`. */
	unsavedChanges?: string;
}

export interface EditorCanvasProps {
	spec: SpecDraft;
	plugins: FieldTypePlugin[];
	context?: FieldContext;
	selectedAccessor: string | null;
	onSelect: (accessor: string | null) => void;
	onEdit: (accessor: string) => void;
	labels: CanvasLabels;
	/**
	 * Notified with the field and its flat-schema index right before it's
	 * removed from the draft — lets a host (SpecEditor) capture enough to
	 * offer an undo, without owning the deletion itself (removal always
	 * happens here, via `apply(removeField(...))`, regardless of whether a
	 * listener is supplied). Addition beyond T5's original EditorCanvasProps:
	 * T12 (binding) requires the delete undo toast to be composed by
	 * SpecEditor, which has no other way to observe a canvas-initiated delete.
	 */
	onDeleteField?: (field: Field, flatIndex: number) => void;
	/** Controlled active tab (LIFTED to SpecEditor — toolbar spec 2026-07-13):
	 * the canvas renders this tab and reports every internally-caused change
	 * (tab click, tabdrop hover, section move/delete, shrink reset) here. */
	activeTabIndex: number;
	onActiveTabChange: (index: number) => void;
	/** One-shot pulse (autoFocusLabel idiom): when it rises to a section
	 * accessor, the canvas opens that section's inline rename input. Set by
	 * SpecEditor's toolbar "+ Section", reset by SpecEditor right after. */
	renameSectionPulse?: string | null;
}

function ShellContent({
	field,
	labels,
}: {
	field: Field;
	labels: CanvasLabels;
}) {
	if (field.config.hidden) {
		return (
			<Text fontSize="sm" color="fg.muted" fontStyle="italic">
				{labels.hiddenField} {field.config.name}
			</Text>
		);
	}
	if (field.field_type === "group") {
		// The real GroupField renders an empty useFieldArray state that reads
		// as broken in an inert canvas — show the spec's framed preview instead.
		const childCount = (field.children ?? []).length;
		return (
			<Box
				borderWidth="1px"
				borderStyle="dashed"
				borderColor="border"
				borderRadius="md"
				p="3"
			>
				<Text fontSize="sm" fontWeight="medium">
					{field.config.name}
				</Text>
				<Text fontSize="xs" color="fg.muted">
					{labels.groupPreview} · {childCount}
				</Text>
			</Box>
		);
	}
	return <FieldComponent field={field} />;
}
ShellContent.displayName = "ShellContent";

export function EditorCanvas({
	spec,
	plugins,
	context,
	selectedAccessor,
	onSelect,
	onEdit,
	labels,
	onDeleteField,
	activeTabIndex,
	onActiveTabChange,
	renameSectionPulse,
}: EditorCanvasProps) {
	const { partition, draft, apply } = spec;
	// Fully controlled active tab (lifted to SpecEditor): this derived string
	// is only Tabs.Root's value dialect — the number is the source of truth.
	const activeTab = `tab-${activeTabIndex}`;
	const [renaming, setRenaming] = useState<string | null>(null);
	// Insertion boundaries are display:none while a drag is active: dnd-kit's
	// transforms create stacking contexts that would otherwise drop the
	// transforming shells below the hover-revealable boundary strips, and
	// insert affordances have no business mid-drag anyway.
	const [dragActive, setDragActive] = useState(false);
	// The dragged field's accessor while a drag is live — drives the overlay
	// preview clone (drag-feedback spec, Decision 1).
	const [activeDragId, setActiveDragId] = useState<string | null>(null);
	// The live drop resolution (Decision 3): refreshed on every dnd-kit over
	// change, cleared on drop/cancel. handleDragEnd resolves the SAME
	// function at release — line, tint, highlight, and the executed move can
	// never disagree.
	const [liveTarget, setLiveTarget] = useState<ResolvedDropTarget | null>(null);
	// Escape cancels the rename Input without committing; this guards the
	// blur that may follow it from re-committing the cancelled text.
	const skipBlurRef = useRef(false);
	const { confirm } = useConfirmModal();
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// Computed ONCE per draft identity (rather than separately for the
	// useForm initializer, the reset-guard ref's initializer, and the effect
	// below) — getDefaultValues(draft, plugins) + its JSON serialization were
	// each re-run redundantly on every render even though only one of the
	// three call sites actually needed a fresh value on any given render.
	const { defaults, serialized: serializedDefaults } = useMemo(() => {
		const next = getDefaultValues(draft, plugins);
		return { defaults: next, serialized: JSON.stringify(next) };
	}, [draft, plugins]);

	// Scratch form so real field components render authentic defaults.
	const methods = useForm({ defaultValues: defaults });
	const markerConvention = useMemo(
		() => resolveMarkerConvention(spec.draft),
		[spec.draft],
	);
	// Memoized so the context value doesn't change identity every render.
	const markers = useMemo<FormMarkers>(
		() =>
			markerConvention === "optional-text"
				? {
						showRequiredIndicator: false,
						optionalText: labels.optionalMarker ?? "(optional)",
						dirtyLabel: labels.unsavedChanges ?? "Unsaved changes",
					}
				: { dirtyLabel: labels.unsavedChanges ?? "Unsaved changes" },
		[markerConvention, labels.optionalMarker, labels.unsavedChanges],
	);
	// Reset ONLY when the defaults actually changed — a per-keystroke reset
	// would re-render every registered field (incl. heavy ones like TipTap).
	const lastDefaultsRef = useRef(serializedDefaults);
	useEffect(() => {
		if (serializedDefaults !== lastDefaultsRef.current) {
			lastDefaultsRef.current = serializedDefaults;
			methods.reset(defaults);
		}
	}, [serializedDefaults, defaults, methods]);

	// Reset the active tab only when the draft's tab count shrinks below the
	// active index (e.g. deleting a section). Do NOT reset on every draft
	// change (unlike SpecForm) — in the editor, edits are constant and must
	// not yank the author back to the first tab.
	useEffect(() => {
		// `!== 0` guard: an empty spec (0 tabs) with the default index 0 needs
		// no report — avoids a redundant parent call on every canvas mount.
		if (activeTabIndex !== 0 && activeTabIndex >= partition.tabs.length) {
			onActiveTabChange(0);
		}
	}, [partition.tabs.length, activeTabIndex, onActiveTabChange]);

	// The toolbar's "+ Section" (SpecEditor) can't reach this canvas-internal
	// rename state — the new section's accessor arrives as a one-shot pulse.
	// startRename's body is inlined so the effect's deps stay exact.
	useEffect(() => {
		if (renameSectionPulse != null) {
			skipBlurRef.current = false;
			setRenaming(renameSectionPulse);
		}
	}, [renameSectionPulse]);

	// Editor-side index: unlike the renderer's default buildSearchIndex call,
	// HIDDEN fields are included — they render as selectable rows on the canvas.
	const searchIndex = useMemo(
		() =>
			buildSearchIndex(partition.tabs, labels.defaultTab, {
				includeHidden: true,
			}),
		[partition, labels.defaultTab],
	);

	const invalidAccessors = useMemo(
		() => new Set(spec.validation.fieldErrors.map((e) => e.accessor)),
		[spec.validation],
	);

	// Per-tab error count for the TAB badge (mirrors SpecFormTabs). A single
	// duplicate-accessor error must badge EVERY tab containing a field with
	// that accessor, so this walks partition.tabs' fields — not a
	// first-occurrence lookup — checking presence (not per-field multiplicity)
	// against each tab's accessor set.
	const tabErrorCounts = useMemo(
		() =>
			partition.tabs.map((tab) => {
				const accessors = new Set(
					tab.fields.map((field) => field.config.api_accessor),
				);
				return spec.validation.fieldErrors.filter((error) =>
					accessors.has(error.accessor),
				).length;
			}),
		[partition, spec.validation],
	);

	// F2b: deletes the EXACT field object clicked, by its position in the
	// flat draft — not by accessor. A consumer-supplied schema can contain
	// duplicate accessors (the InvalidDraft state); an accessor-keyed delete
	// would remove every field sharing it. `field` is the same object
	// reference `renderFields` pulled from `draft` (via `partition`, itself
	// built by walking `draft`), so `draft.indexOf(field)` unambiguously
	// resolves ITS position even when its accessor is duplicated.
	const handleDeleteField = (field: Field, flatIndex: number) => {
		if (selectedAccessor === field.config.api_accessor) onSelect(null);
		if (flatIndex === -1) return;
		onDeleteField?.(field, flatIndex);
		apply(removeFieldAt(draft, flatIndex));
	};

	// F2c/F4a: the accessor-keyed count only knows "does this accessor
	// appear more than once", i.e. an authoring mistake the panel now blocks
	// editing on (F2a) — duplicating it would compound the ambiguity further.
	// The type count enforces `plugin.maxPerSpec`: duplicating a field whose
	// type has already reached its limit would immediately re-violate it
	// with no visible error (F4).
	const accessorCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const f of draft) {
			counts.set(
				f.config.api_accessor,
				(counts.get(f.config.api_accessor) ?? 0) + 1,
			);
		}
		return counts;
	}, [draft]);
	const typeCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const f of draft) {
			counts.set(f.field_type, (counts.get(f.field_type) ?? 0) + 1);
		}
		return counts;
	}, [draft]);
	const isDuplicateDisabled = (field: Field): boolean => {
		const dupAccessor =
			(accessorCounts.get(field.config.api_accessor) ?? 0) > 1;
		if (dupAccessor) return true;
		const plugin = plugins.find((p) => p.id === field.field_type);
		if (plugin?.maxPerSpec == null) return false;
		return (typeCounts.get(field.field_type) ?? 0) >= plugin.maxPerSpec;
	};

	const handleDuplicate = (accessor: string) => {
		const field = draft.find((f) => f.config.api_accessor === accessor);
		if (field && isDuplicateDisabled(field)) return; // defense-in-depth: button is also disabled
		// Computed from the PRE-duplication draft, same as duplicateField's own
		// internal call — so this always names the exact copy it's about to
		// insert, without re-deriving or guessing its accessor after the fact.
		const copyAccessor = uniquifyAccessor(draft, accessor);
		apply(duplicateField(draft, accessor));
		onSelect(copyAccessor);
	};

	const startRename = (accessor: string) => {
		// Clear any leftover blur suppression from a previous session whose
		// Enter/Escape set the flag but whose input unmounted without firing
		// blur — a stale flag would swallow THIS session's blur commit.
		skipBlurRef.current = false;
		setRenaming(accessor);
	};

	const commitRename = (accessor: string, name: string) => {
		setRenaming(null);
		const trimmed = name.trim();
		if (trimmed) apply(renameSection(draft, accessor, trimmed));
	};

	// F9: moveSection reorders section BLOCKS but the canvas's activeTab is a
	// numeric index into that order — moving the currently-viewed section
	// (or the neighbor it swaps with) left an unadjusted index pointing at
	// whatever slid into the old slot, silently switching the visible tab's
	// CONTENT out from under the author.
	const handleMoveSection = (accessor: string, direction: -1 | 1) => {
		const next = moveSection(draft, accessor, direction);
		if (next !== draft) {
			const movedTabIndex = partition.tabs.findIndex(
				(tab) => tab.section?.config.api_accessor === accessor,
			);
			if (movedTabIndex !== -1) {
				if (activeTabIndex === movedTabIndex) {
					// Viewing the section that moved: follow it to its new index.
					onActiveTabChange(activeTabIndex + direction);
				} else if (activeTabIndex === movedTabIndex + direction) {
					// Viewing the neighbor it swapped places with: follow the swap.
					onActiveTabChange(activeTabIndex - direction);
				}
			}
		}
		apply(next);
	};

	const handleOrientation = (o: "horizontal" | "vertical") =>
		apply(setOrientation(draft, o));

	const handleDeleteSection = async (accessor: string, name: string) => {
		const ok = await confirm({
			title: labels.deleteSection,
			message: labels.deleteSectionConfirm.replace("{section}", name),
			colorPalette: "red",
		});
		if (!ok) return;
		// Every tab at or after the deleted one shifts down an index, so an
		// unadjusted numeric activeTab would land on the NEXT section's
		// content. Follow the fields instead: deleting the active tab lands
		// on the previous tab (which absorbs the merged fields); deleting an
		// earlier tab keeps the same section active at its shifted index.
		const deletedIndex = partition.tabs.findIndex(
			(tab) => tab.section?.config.api_accessor === accessor,
		);
		if (deletedIndex !== -1 && activeTabIndex >= deletedIndex) {
			onActiveTabChange(Math.max(0, activeTabIndex - 1));
		}
		apply(deleteSection(draft, accessor));
	};

	const handleDeleteCardMerge = (accessor: string) => {
		if (selectedAccessor === accessor) onSelect(null);
		apply(deleteCardMerge(draft, accessor));
	};

	const handleDeleteCardWithFields = async (accessor: string, name: string) => {
		const ok = await confirm({
			title: labels.deleteCardWithFields,
			message: labels.deleteCardWithFieldsConfirm.replace(
				"{card}",
				name.trim() || labels.cardUntitled,
			),
			colorPalette: "red",
		});
		if (!ok) return;
		// Clearing only a selected MARKER is needed here — a selected field
		// inside the block simply stops resolving (SpecEditor's selectedField
		// lookup misses), which closes the panel on its own.
		if (selectedAccessor === accessor) onSelect(null);
		apply(deleteCardWithFields(draft, accessor));
	};

	const buildCardMenu = (card: Field) => (
		<CardMenu
			cardAccessor={card.config.api_accessor}
			onRename={onEdit}
			onDeleteMerge={handleDeleteCardMerge}
			onDeleteWithFields={(a) =>
				handleDeleteCardWithFields(a, card.config.name)
			}
			labels={labels}
			triggerAriaLabel={labels.cardMenu.replace(
				"{card}",
				card.config.name.trim() || labels.cardUntitled,
			)}
		/>
	);

	// Hovering a tab-trigger drop zone while dragging activates that tab so
	// the user can see where the field will land before releasing. The
	// activation stays UNCONDITIONAL (not gated on resolveDropTarget):
	// hovering back onto the SOURCE tab's own trigger is a null target
	// (releasing there is a no-op) but must still switch the view back.
	// Highlight ≠ activation: only a non-null tab target highlights.
	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		if (typeof overId === "string" && overId.startsWith("tabdrop-")) {
			onActiveTabChange(Number(overId.slice("tabdrop-".length)));
		}
		setLiveTarget(
			event.over == null
				? null
				: resolveDropTarget(
						String(event.active.id),
						String(event.over.id),
						draft,
						partition,
					),
		);
	};

	const handleDragStart = (event: DragStartEvent) => {
		setDragActive(true);
		setActiveDragId(String(event.active.id));
		setLiveTarget(null);
	};
	const handleDragCancel = () => {
		setDragActive(false);
		setActiveDragId(null);
		setLiveTarget(null);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		// Before the early returns: every drop ends the drag, valid target or not.
		setDragActive(false);
		setActiveDragId(null);
		setLiveTarget(null);
		const { active, over } = event;
		if (!over) return;
		// ONE source of truth (drag-feedback spec, Decision 3): the same
		// resolution that drives the live indicator/tint decides the drop.
		// The full decision logic — card branch, field-over-frame snap,
		// cross-tab guard, tabdrop targets — lives in resolveDropTarget,
		// ported verbatim; this handler only applies the answer.
		const target = resolveDropTarget(
			String(active.id),
			String(over.id),
			draft,
			partition,
		);
		if (!target) return;
		switch (target.kind) {
			case "card-block":
				apply(
					moveCard(
						draft,
						String(active.id),
						target.targetCardAccessor,
						target.placement,
					),
				);
				return;
			case "tab":
				apply(moveFieldToSection(draft, String(active.id), target.tabIndex));
				return;
			case "field":
				apply(moveField(draft, target.fromIndex, target.targetIndex));
				return;
		}
	};

	// Built per-field so the canvas (not FieldShell) owns the cross-section
	// move logic; undefined when there's nowhere else to move a field to
	// (no sections, or a single tab — the menu would be empty).
	const buildMoveMenu = (field: Field, tabIndex: number) => {
		if (!partition.hasSections || partition.tabs.length < 2) return undefined;
		const accessor = field.config.api_accessor;
		return (
			<MenuRoot>
				{/* Tooltip outermost: its Trigger (asChild) clones onto MenuTrigger,
				    which forwards to the IconButton — both behaviors merge onto one
				    button. The reverse nesting breaks: MenuTrigger asChild would
				    spread its props onto Tooltip.Root instead of the button. */}
				<Tooltip content={labels.moveToSection}>
					<MenuTrigger asChild>
						<IconButton
							aria-label={labels.moveToSection}
							size="2xs"
							variant="ghost"
						>
							<FolderInput size={14} />
						</IconButton>
					</MenuTrigger>
				</Tooltip>
				<MenuContent>
					{partition.tabs.map((tab, i) => {
						if (i === tabIndex) return null;
						const key = tab.section?.config.api_accessor ?? `implicit-${i}`;
						return (
							<MenuItem
								key={key}
								value={key}
								onSelect={() => apply(moveFieldToSection(draft, accessor, i))}
							>
								{tab.section?.config.name ?? labels.defaultTab}
							</MenuItem>
						);
					})}
				</MenuContent>
			</MenuRoot>
		);
	};

	const firstSectionIndex = partition.tabs.findIndex(
		(tab) => tab.section !== null,
	);

	const pickerLabels: TypePickerLabels = {
		searchPlaceholder: labels.typeSearchPlaceholder,
		searchLabel: labels.typeSearchLabel,
		noMatches: labels.typeNoMatches,
		maxReached: labels.typeMaxReached,
		categories: labels.typeCategories,
	};

	const insertAt =
		(tabIndex: number, position: number) => (pluginId: string) => {
			const plugin = plugins.find((p) => p.id === pluginId);
			if (!plugin) return;
			const newField = createField(plugin, draft);
			apply(
				insertFieldAt(
					draft,
					newField,
					flatInsertIndex(draft, partition, tabIndex, position),
				),
			);
			// Selects it AND focuses the panel's Label input — matching the spec's
			// "insert, select, focus the label" flow so the author can name the
			// field immediately without an extra click.
			onEdit(newField.config.api_accessor);
		};

	const insertionBoundary = (
		tabIndex: number,
		position: number,
		variant: "overlay" | "flow",
		alwaysVisible = false,
	) => (
		<Flex
			key={`insert-${tabIndex}-${position}`}
			role="group"
			justify="center"
			align="center"
			height="5"
			// Hidden entirely mid-drag (see dragActive) — a hover-revealable
			// strip over a transforming shell would intercept the pointer and
			// paint above it (dnd-kit transforms create stacking contexts that
			// tie-break against the boundary's z-index).
			display={dragActive ? "none" : undefined}
			{...(variant === "overlay"
				? {
						position: "absolute" as const,
						top: "-5",
						left: "0",
						right: "0",
						zIndex: "docked",
					}
				: // The flow variant must be its own containing block: without it
					// the absolutely positioned hairline below resolves against
					// Tabs.Root / the viewport and paints far outside the strip.
					{ position: "relative" as const })}
			opacity={alwaysVisible ? 1 : 0}
			_hover={{ opacity: 1 }}
			// Keyboard parity with _hover: without this, Tabbing onto the ⊕
			// button lands on an invisible control (WCAG 2.4.7).
			_focusWithin={{ opacity: 1 }}
			transition="opacity 0.15s"
		>
			{/* hairline across the gap; the ⊕ chip sits on top and breaks it */}
			<Box
				position="absolute"
				left="0"
				right="0"
				top="50%"
				borderTopWidth="2px"
				borderColor="accent"
			/>
			<Box position="relative" bg="bg-surface" borderRadius="full">
				<TypePickerPopover
					// "section"/"card" are inserted only via the TOOLBAR's "+ Section"
					// and "+ Card" buttons (SpecEditor) — offering them here too would give
					// authors two competing ways to add one, and this path skips
					// the marker bookkeeping (addSection / insertCard's auto-wrap)
					// that keeps tabs and cards consistent.
					plugins={plugins.filter((p) => p.id !== "section" && p.id !== "card")}
					context={context}
					currentSpec={draft}
					onPick={insertAt(tabIndex, position)}
					triggerLabel={labels.addField}
					pickerLabels={pickerLabels}
				/>
			</Box>
		</Flex>
	);

	// Split the live target by kind once — renderFields and the tab strip
	// read these (exactly one of the three is non-null during a drag with a
	// resolvable target; all null otherwise).
	const fieldTarget = liveTarget?.kind === "field" ? liveTarget : null;
	const cardBlockTarget = liveTarget?.kind === "card-block" ? liveTarget : null;
	const tabTarget = liveTarget?.kind === "tab" ? liveTarget : null;

	const renderFields = (fields: Field[], tabIndex: number) => {
		// Keys: plain accessor for the first (usually only) occurrence — a
		// position-dependent key would remount shells on every reorder,
		// tearing down the focused drag handle mid-keyboard-drag. Duplicate
		// accessors (consumer-provided schemas only — the panel gate prevents
		// authoring them) get an occurrence suffix so both shells render
		// instead of colliding as React siblings.
		const occurrences = new Map<string, number>();
		const keyFor = (accessor: string) => {
			const n = occurrences.get(accessor) ?? 0;
			occurrences.set(accessor, n + 1);
			return n === 0 ? accessor : `${accessor}-${n}`;
		};

		const shellFor = (field: Field, tabPosition: number) => (
			<Fragment key={keyFor(field.config.api_accessor)}>
				<Box position="relative">
					{insertionBoundary(tabIndex, tabPosition, "overlay")}
					{fieldTarget?.indicator?.tabIndex === tabIndex &&
						fieldTarget.indicator.position === tabPosition && (
							<DropIndicatorLine
								variant="above"
								position={`${tabIndex}:${tabPosition}`}
							/>
						)}
					<FieldShell
						field={field}
						selected={selectedAccessor === field.config.api_accessor}
						invalid={invalidAccessors.has(field.config.api_accessor)}
						onSelect={(a) => onSelect(a)}
						onEdit={onEdit}
						onDuplicate={handleDuplicate}
						// Position-based (F2b): closes over THIS exact field object
						// and its flat-draft index, ignoring whatever accessor
						// FieldShell's internal onClick passes — required so the
						// second of two duplicate-accessor shells deletes only
						// itself, not both.
						onDelete={() => handleDeleteField(field, draft.indexOf(field))}
						duplicateDisabled={isDuplicateDisabled(field)}
						moveMenu={buildMoveMenu(field, tabIndex)}
						labels={labels}
					>
						<ShellContent field={field} labels={labels} />
					</FieldShell>
				</Box>
			</Fragment>
		);

		const cardPartition = partitionTabByCards(fields);

		if (!cardPartition.hasCards) {
			return (
				<SortableContext
					items={fields.map((f) => f.config.api_accessor)}
					strategy={noopSortingStrategy}
				>
					<Stack gap="5">
						{fields.map((field, i) => shellFor(field, i))}
						{insertionBoundary(
							tabIndex,
							fields.length,
							"flow",
							fields.length === 0, // empty tab: visible drop zone
						)}
						{/* Mid-drag the ⊕ boundary above is display:none — this
						    same-height slot replaces it so the tab end doesn't
						    collapse (the list holds still), and it carries the
						    line when the tab-end slot is the resolved target. */}
						{dragActive && (
							<DropIndicatorLine
								variant="flow"
								active={
									fieldTarget?.indicator?.tabIndex === tabIndex &&
									fieldTarget.indicator.position === fields.length
								}
								position={`${tabIndex}:${fields.length}`}
							/>
						)}
					</Stack>
				</SortableContext>
			);
		}

		// Carded tab. Drag stays ONE-DIMENSIONAL: a single flat sortable list
		// — markers AND fields — regardless of how the frames render them
		// (dropping a field into another card is just crossing the marker in
		// flat order; the card header handle block-moves via handleDragEnd's
		// card branch). `position` runs over tab.fields (markers included) so
		// each insertion boundary keeps speaking flatInsertIndex's
		// position-within-tab dialect.
		let position = 0;
		return (
			<SortableContext
				items={fields.map((f) => f.config.api_accessor)}
				strategy={noopSortingStrategy}
			>
				<Stack gap="5">
					{cardPartition.cards.map((group) => {
						if (group.card) position++; // the marker occupies one position
						const bodyStart = position;
						position += group.fields.length;
						const body = (
							<Stack gap="5">
								{group.fields.map((field, j) => shellFor(field, bodyStart + j))}
								{insertionBoundary(
									tabIndex,
									bodyStart + group.fields.length,
									"flow",
									group.fields.length === 0, // empty card: visible drop zone
								)}
								{/* Same-height flow slot mid-drag — see the card-less
								    branch. This is also where an EMPTY card's line
								    renders (its bodyStart slot). */}
								{dragActive && (
									<DropIndicatorLine
										variant="flow"
										active={
											fieldTarget?.indicator?.tabIndex === tabIndex &&
											fieldTarget.indicator.position ===
												bodyStart + group.fields.length
										}
										position={`${tabIndex}:${bodyStart + group.fields.length}`}
									/>
								)}
							</Stack>
						);
						if (!group.card) {
							// Implicit leading group (hand-written schemas only — the
							// editor never produces loose fields in a carded tab):
							// degrade exactly like the renderer, an untitled frame.
							// validateSpec flags each loose field, so its shell
							// outlines in the danger color inside the frame.
							// partitionTabByCards only ever produces this card:null
							// group as the FIRST entry (fields before any marker) —
							// so a fixed key is safe, no array index needed.
							return <CardSurface key="implicit-leading">{body}</CardSurface>;
						}
						return (
							<CardFrame
								key={keyFor(group.card.config.api_accessor)}
								card={group.card}
								selected={selectedAccessor === group.card.config.api_accessor}
								onSelect={(a) => onSelect(a)}
								menu={buildCardMenu(group.card)}
								labels={labels}
								dropTint={
									fieldTarget?.tintCardAccessor ===
									group.card.config.api_accessor
								}
								dropIndicator={
									cardBlockTarget?.targetCardAccessor ===
									group.card.config.api_accessor
										? cardBlockTarget.placement
										: null
								}
							>
								{body}
							</CardFrame>
						);
					})}
				</Stack>
			</SortableContext>
		);
	};

	const activeDragField = activeDragId
		? (draft.find((f) => f.config.api_accessor === activeDragId) ?? null)
		: null;
	// PORTALED to document.body (drag-feedback spec, Decision 1): dnd-kit's
	// DragOverlay renders a position:fixed wrapper IN PLACE — inside a
	// transformed/filtered host ancestor (a drawer, a scaled preview) that
	// wrapper would anchor to the wrong containing block. The portal keeps
	// React context (FormProvider, plugin registry) while escaping the DOM.
	// dnd-kit positions the clone at the active node's initial rect and
	// moves it with the drag delta; keyboard drags glide via the built-in
	// 'transform 250ms ease' overlay transition (keyboard parity, Decision
	// 5). Card drags collapse the wrapper to the header-bar clone via
	// height:auto (the wrapper is otherwise sized to the full frame rect).
	const overlayPortal = createPortal(
		<DragOverlay
			style={
				activeDragField?.field_type === "card" ? { height: "auto" } : undefined
			}
		>
			{activeDragField ? (
				activeDragField.field_type === "card" ? (
					<CardDragPreview
						card={activeDragField}
						fieldCount={cardBlockFieldCount(draft, activeDragField)}
						labels={labels}
					/>
				) : (
					<ShellDragPreview>
						<ShellContent field={activeDragField} labels={labels} />
					</ShellDragPreview>
				)
			) : null}
		</DragOverlay>,
		document.body,
	);

	if (partition.tabs.length === 0) {
		return (
			<FormProvider {...methods}>
				<FormMarkersProvider value={markers}>
					<Box data-testid="editor-canvas-empty" p="6" textAlign="center">
						<Stack gap="3" align="center">
							<Text color="fg.muted">{labels.emptySpec}</Text>
							{insertionBoundary(0, 0, "flow", true)}
						</Stack>
					</Box>
				</FormMarkersProvider>
			</FormProvider>
		);
	}

	if (!partition.hasSections) {
		return (
			<FormProvider {...methods}>
				<FormMarkersProvider value={markers}>
					<DndContext
						sensors={sensors}
						collisionDetection={editorCollision}
						onDragStart={handleDragStart}
						onDragOver={handleDragOver}
						onDragEnd={handleDragEnd}
						onDragCancel={handleDragCancel}
					>
						{/* The first field's overlay boundary reaches 20px above the
						    shell — SpecEditor's p="5" mode container (0.8.2) provides
						    exactly that space now that the floating insert row is gone. */}
						<Box ref={containerRef}>
							{renderFields(partition.tabs[0].fields, 0)}
						</Box>
						{overlayPortal}
					</DndContext>
				</FormMarkersProvider>
			</FormProvider>
		);
	}

	return (
		<FormProvider {...methods}>
			<FormMarkersProvider value={markers}>
				<DndContext
					sensors={sensors}
					collisionDetection={editorCollision}
					onDragStart={handleDragStart}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
					onDragCancel={handleDragCancel}
				>
					<Box ref={containerRef}>
						<Tabs.Root
							value={activeTab}
							onValueChange={(e) =>
								onActiveTabChange(Number(e.value.replace("tab-", "")))
							}
							orientation={orientation}
						>
							<Flex align="center" justify="space-between" gap="4">
								<Tabs.List flex="1">
									{partition.tabs.map((tab, i) => {
										const accessor = tab.section?.config.api_accessor;
										const key = accessor ?? `implicit-${i}`;

										if (accessor && renaming === accessor) {
											return (
												<TabDropZone
													key={key}
													tabIndex={i}
													highlighted={tabTarget?.tabIndex === i}
												>
													<Input
														size="xs"
														width="auto"
														maxWidth="10rem"
														autoFocus
														defaultValue={tab.section?.config.name}
														aria-label={labels.sectionNameInput}
														onClick={(e) => e.stopPropagation()}
														onKeyDown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																// Mirror the Escape path: suppress the follow-on
																// blur so the commit isn't applied twice.
																skipBlurRef.current = true;
																commitRename(accessor, e.currentTarget.value);
															} else if (e.key === "Escape") {
																// Stop the rename cancel from also reaching the
																// document-level Escape/deselect listener (T12).
																e.stopPropagation();
																skipBlurRef.current = true;
																setRenaming(null);
															}
														}}
														onBlur={(e) => {
															if (skipBlurRef.current) {
																skipBlurRef.current = false;
																return;
															}
															commitRename(accessor, e.currentTarget.value);
														}}
													/>
												</TabDropZone>
											);
										}

										return (
											<TabDropZone
												key={key}
												tabIndex={i}
												highlighted={tabTarget?.tabIndex === i}
											>
												<Flex role="presentation" align="center" gap="0.5">
													<Tabs.Trigger value={`tab-${i}`}>
														{tab.section?.config.name ?? labels.defaultTab}
														{tabErrorCounts[i] > 0 && (
															<TabErrorBadge
																index={i}
																count={tabErrorCounts[i]}
																label={formatCount(
																	labels.tabErrorsOne ?? "1 invalid field",
																	labels.tabErrors ?? "{count} invalid fields",
																	tabErrorCounts[i],
																)}
															/>
														)}
													</Tabs.Trigger>
													{tab.section && accessor && (
														<SectionMenu
															sectionAccessor={accessor}
															sectionName={tab.section.config.name}
															isFirst={i === firstSectionIndex}
															orientation={partition.orientation}
															onRename={(a) => startRename(a)}
															onMove={handleMoveSection}
															onDelete={() =>
																handleDeleteSection(
																	accessor,
																	tab.section?.config.name ?? "",
																)
															}
															onOrientation={handleOrientation}
															labels={labels}
															triggerAriaLabel={labels.sectionMenu.replace(
																"{section}",
																tab.section.config.name,
															)}
														/>
													)}
												</Flex>
											</TabDropZone>
										);
									})}
								</Tabs.List>
								<FieldSearch
									index={searchIndex}
									placeholder={labels.searchPlaceholder}
									noResultsLabel={labels.noResults}
									label={labels.searchLabel ?? "Find field"}
									onJump={(r) => {
										onActiveTabChange(r.tabIndex);
										onSelect(r.accessor);
									}}
								/>
							</Flex>
							{partition.tabs.map((tab, i) => (
								<Tabs.Content
									key={tab.section?.config.api_accessor ?? `implicit-${i}`}
									value={`tab-${i}`}
								>
									{/* pt="5": the first field's overlay boundary reaches 20px
								    above the shell — this padding is the space it fills. */}
									<Box pt="5">{renderFields(tab.fields, i)}</Box>
								</Tabs.Content>
							))}
						</Tabs.Root>
					</Box>
					{overlayPortal}
				</DndContext>
			</FormMarkersProvider>
		</FormProvider>
	);
}
EditorCanvas.displayName = "EditorCanvas";
