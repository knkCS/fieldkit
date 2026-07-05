// src/editor/editor-canvas.tsx
import { Box, Flex, Input, Stack, Text } from "@chakra-ui/react";
import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	type DragOverEvent,
	KeyboardSensor,
	PointerSensor,
	useDroppable,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	SortableContext,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button, IconButton } from "@knkcs/anker/atoms";
import { useConfirmModal } from "@knkcs/anker/feedback";
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
import { FormProvider, useForm } from "react-hook-form";
import { FieldComponent } from "../renderer/field-component";
import { FieldSearch } from "../renderer/spec-form/field-search";
import { useContainerOrientation } from "../renderer/spec-form/use-container-orientation";
import type { FieldContext, FieldTypePlugin } from "../schema/plugin";
import type { Field } from "../schema/types";
import { getDefaultValues } from "../schema/zod-builder";
import {
	addSection,
	deleteSection,
	duplicateField,
	flatInsertIndex,
	insertFieldAt,
	moveField,
	moveFieldToSection,
	moveSection,
	nextAccessor,
	removeFieldAt,
	renameSection,
	setOrientation,
	uniquifyAccessor,
} from "./draft-ops";
import type { FieldShellToolbarLabels } from "./field-shell";
import { FieldShell } from "./field-shell";
import type { SectionMenuLabels } from "./section-menu";
import { SectionMenu } from "./section-menu";
import { TypePickerPopover } from "./type-picker-popover";
import type { SpecDraft } from "./use-spec-draft";

/** Droppable wrapper for a tab-trigger row — a cross-section drag target. */
function TabDropZone({
	tabIndex,
	children,
}: {
	tabIndex: number;
	children: ReactNode;
}) {
	const { setNodeRef } = useDroppable({ id: `tabdrop-${tabIndex}` });
	return (
		<Box ref={setNodeRef} data-testid={`tabdrop-${tabIndex}`}>
			{children}
		</Box>
	);
}
TabDropZone.displayName = "TabDropZone";

interface CanvasLabels extends SectionMenuLabels {
	defaultTab: string;
	searchPlaceholder: string;
	noResults: string;
	hiddenField: string; // e.g. "Hidden field:" prefix
	groupPreview: string; // e.g. "Repeating group" — child count appended
	addField: string; // aria-label for the ⊕ insertion trigger
	emptySpec: string; // empty-spec placeholder message
	shell: FieldShellToolbarLabels;
	moveToSection: string; // aria-label/tooltip for the "Move to section…" toolbar trigger
	// "{section}" interpolated — MUST say fields survive (move to the previous tab)
	deleteSectionConfirm: string;
	sectionMenu: string; // "{section}" interpolated — aria-label for the menu trigger
	addSection: string; // "+ Section" button label
	newSectionName: string; // default name for a freshly added section
	sectionNameInput: string; // aria-label for the inline rename input
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
}: EditorCanvasProps) {
	const { partition, draft, apply } = spec;
	const [activeTab, setActiveTab] = useState("tab-0");
	const [renaming, setRenaming] = useState<string | null>(null);
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

	// Scratch form so real field components render authentic defaults.
	const methods = useForm({ defaultValues: getDefaultValues(draft) });
	// Reset ONLY when the defaults actually changed — a per-keystroke reset
	// would re-render every registered field (incl. heavy ones like TipTap).
	const lastDefaultsRef = useRef(JSON.stringify(getDefaultValues(draft)));
	// biome-ignore lint/correctness/useExhaustiveDependencies: guarded by content comparison
	useEffect(() => {
		const next = getDefaultValues(draft);
		const serialized = JSON.stringify(next);
		if (serialized !== lastDefaultsRef.current) {
			lastDefaultsRef.current = serialized;
			methods.reset(next);
		}
	}, [draft]);

	// Reset the active tab only when the draft's tab count shrinks below the
	// active index (e.g. deleting a section). Do NOT reset on every draft
	// change (unlike SpecForm) — in the editor, edits are constant and must
	// not yank the author back to the first tab.
	useEffect(() => {
		const activeIndex = Number(activeTab.replace("tab-", ""));
		if (activeIndex >= partition.tabs.length) setActiveTab("tab-0");
	}, [partition.tabs.length, activeTab]);

	// Editor-side index: unlike the renderer's buildSearchIndex, HIDDEN fields
	// are included — they render as selectable rows on the canvas.
	const searchIndex = useMemo(
		() =>
			partition.tabs.flatMap((tab, tabIndex) =>
				tab.fields.map((field) => ({
					accessor: field.config.api_accessor,
					label: field.config.name,
					tabIndex,
					tabLabel: tab.section?.config.name ?? labels.defaultTab,
				})),
			),
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

	const handleAddSection = () => {
		const next = addSection(draft, labels.newSectionName);
		const added = next[next.length - 1];
		apply(next);
		// Appending a section always adds exactly one tab at the end,
		// regardless of the current tab count (0, 1 implicit, or many).
		setActiveTab(`tab-${partition.tabs.length}`);
		startRename(added.config.api_accessor);
	};

	const handleMoveSection = (accessor: string, direction: -1 | 1) =>
		apply(moveSection(draft, accessor, direction));

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
		const activeIndex = Number(activeTab.replace("tab-", ""));
		if (deletedIndex !== -1 && activeIndex >= deletedIndex) {
			setActiveTab(`tab-${Math.max(0, activeIndex - 1)}`);
		}
		apply(deleteSection(draft, accessor));
	};

	// Hovering a tab-trigger drop zone while dragging activates that tab so
	// the user can see where the field will land before releasing.
	const handleDragOver = (event: DragOverEvent) => {
		const overId = event.over?.id;
		if (typeof overId !== "string" || !overId.startsWith("tabdrop-")) return;
		setActiveTab(`tab-${overId.slice("tabdrop-".length)}`);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over) return;
		const activeAccessor = String(active.id);
		const overId = String(over.id);

		if (overId.startsWith("tabdrop-")) {
			const tabIndex = Number(overId.slice("tabdrop-".length));
			// Releasing over the field's OWN tab trigger must be a no-op:
			// moveFieldToSection appends to the target tab, so an unguarded
			// self-drop would silently jump the field to its tab's end.
			const sourceTabIndex = partition.tabs.findIndex((tab) =>
				tab.fields.some((f) => f.config.api_accessor === activeAccessor),
			);
			if (sourceTabIndex === tabIndex) return;
			apply(moveFieldToSection(draft, activeAccessor, tabIndex));
			return;
		}

		if (activeAccessor === overId) return;
		const fromIndex = draft.findIndex(
			(f) => f.config.api_accessor === activeAccessor,
		);
		const toIndex = draft.findIndex((f) => f.config.api_accessor === overId);
		if (fromIndex === -1 || toIndex === -1) return;
		apply(moveField(draft, fromIndex, toIndex));
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

	const addSectionButton = (
		<Button variant="ghost" size="xs" onClick={handleAddSection}>
			{labels.addSection}
		</Button>
	);

	const insertAt =
		(tabIndex: number, position: number) => (pluginId: string) => {
			const plugin = plugins.find((p) => p.id === pluginId);
			if (!plugin) return;
			const accessor = nextAccessor(draft, plugin.id);
			const newField: Field = {
				field_type: plugin.id,
				config: {
					name: plugin.name,
					api_accessor: accessor,
					required: false,
					instructions: "",
				},
				settings: plugin.defaultSettings ?? null,
				system: false,
			};
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
			onEdit(accessor);
		};

	const insertionRow = (
		tabIndex: number,
		position: number,
		alwaysVisible: boolean,
	) => (
		<Flex
			key={`insert-${tabIndex}-${position}`}
			role="group"
			justify="center"
			align="center"
			height="6"
			opacity={alwaysVisible ? 1 : 0}
			_hover={{ opacity: 1 }}
			// Keyboard parity with _hover: without this, Tabbing onto the ⊕
			// button lands on an invisible control (WCAG 2.4.7).
			_focusWithin={{ opacity: 1 }}
			transition="opacity 0.15s"
		>
			<TypePickerPopover
				// "section" is inserted only via the strip's "+ Section" button
				// (addSectionButton) — offering it here too would give authors two
				// competing ways to add one, and this path skips the section-marker
				// bookkeeping (addSection) that keeps tabs consistent.
				plugins={plugins.filter((p) => p.id !== "section")}
				context={context}
				currentSpec={draft}
				onPick={insertAt(tabIndex, position)}
				triggerLabel={labels.addField}
			/>
		</Flex>
	);

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
		return (
			<SortableContext
				items={fields.map((f) => f.config.api_accessor)}
				strategy={verticalListSortingStrategy}
			>
				<Stack gap="5">
					{insertionRow(tabIndex, 0, fields.length === 0)}
					{fields.map((field, i) => (
						<Fragment key={keyFor(field.config.api_accessor)}>
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
								labels={labels.shell}
							>
								<ShellContent field={field} labels={labels} />
							</FieldShell>
							{insertionRow(tabIndex, i + 1, false)}
						</Fragment>
					))}
				</Stack>
			</SortableContext>
		);
	};

	if (partition.tabs.length === 0) {
		return (
			<FormProvider {...methods}>
				<Box data-testid="editor-canvas-empty" p="6" textAlign="center">
					<Stack gap="3" align="center">
						<Text color="fg.muted">{labels.emptySpec}</Text>
						{insertionRow(0, 0, true)}
						{addSectionButton}
					</Stack>
				</Box>
			</FormProvider>
		);
	}

	if (!partition.hasSections) {
		return (
			<FormProvider {...methods}>
				<DndContext
					sensors={sensors}
					collisionDetection={closestCenter}
					onDragOver={handleDragOver}
					onDragEnd={handleDragEnd}
				>
					<Box ref={containerRef}>
						<Flex justify="flex-end" mb="2">
							{addSectionButton}
						</Flex>
						{renderFields(partition.tabs[0].fields, 0)}
					</Box>
				</DndContext>
			</FormProvider>
		);
	}

	return (
		<FormProvider {...methods}>
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragOver={handleDragOver}
				onDragEnd={handleDragEnd}
			>
				<Box ref={containerRef}>
					<Tabs.Root
						value={activeTab}
						onValueChange={(e) => setActiveTab(e.value)}
						orientation={orientation}
					>
						<Flex align="center" justify="space-between" gap="4">
							<Tabs.List flex="1">
								{partition.tabs.map((tab, i) => {
									const accessor = tab.section?.config.api_accessor;
									const key = accessor ?? `implicit-${i}`;

									if (accessor && renaming === accessor) {
										return (
											<TabDropZone key={key} tabIndex={i}>
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
										<TabDropZone key={key} tabIndex={i}>
											<Flex role="presentation" align="center" gap="0.5">
												<Tabs.Trigger value={`tab-${i}`}>
													{tab.section?.config.name ?? labels.defaultTab}
													{tabErrorCounts[i] > 0 && (
														<Box
															as="span"
															data-testid={`tab-errors-${i}`}
															bg="danger.600"
															color="white"
															borderRadius="full"
															fontSize="xs"
															px="1.5"
															ml="1.5"
														>
															{tabErrorCounts[i]}
														</Box>
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
							{addSectionButton}
							<FieldSearch
								index={searchIndex}
								placeholder={labels.searchPlaceholder}
								noResultsLabel={labels.noResults}
								onJump={(r) => {
									setActiveTab(`tab-${r.tabIndex}`);
									onSelect(r.accessor);
								}}
							/>
						</Flex>
						{partition.tabs.map((tab, i) => (
							<Tabs.Content
								key={tab.section?.config.api_accessor ?? `implicit-${i}`}
								value={`tab-${i}`}
							>
								<Box pt="4">{renderFields(tab.fields, i)}</Box>
							</Tabs.Content>
						))}
					</Tabs.Root>
				</Box>
			</DndContext>
		</FormProvider>
	);
}
EditorCanvas.displayName = "EditorCanvas";
