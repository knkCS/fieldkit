// src/editor/editor-canvas.tsx
import { Box, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { Button } from "@knkcs/anker/atoms";
import { useConfirmModal } from "@knkcs/anker/feedback";
import { Tabs } from "@knkcs/anker/primitives";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
	moveSection,
	nextAccessor,
	removeField,
	renameSection,
	setOrientation,
} from "./draft-ops";
import type { FieldShellToolbarLabels } from "./field-shell";
import { FieldShell } from "./field-shell";
import type { SectionMenuLabels } from "./section-menu";
import { SectionMenu } from "./section-menu";
import { TypePickerPopover } from "./type-picker-popover";
import type { SpecDraft } from "./use-spec-draft";

interface CanvasLabels extends SectionMenuLabels {
	defaultTab: string;
	searchPlaceholder: string;
	noResults: string;
	hiddenField: string; // e.g. "Hidden field:" prefix
	groupPreview: string; // e.g. "Repeating group" — child count appended
	addField: string; // aria-label for the ⊕ insertion trigger
	emptySpec: string; // empty-spec placeholder message
	shell: FieldShellToolbarLabels;
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

	const handleDelete = (accessor: string) => {
		if (selectedAccessor === accessor) onSelect(null);
		apply(removeField(draft, accessor));
	};
	const handleDuplicate = (accessor: string) =>
		apply(duplicateField(draft, accessor));

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
		setRenaming(added.config.api_accessor);
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
		if (ok) apply(deleteSection(draft, accessor));
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
			onSelect(accessor);
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
				plugins={plugins}
				context={context}
				currentSpec={draft}
				onPick={insertAt(tabIndex, position)}
				triggerLabel={labels.addField}
			/>
		</Flex>
	);

	const renderFields = (fields: Field[], tabIndex: number) => (
		<Stack gap="5">
			{insertionRow(tabIndex, 0, fields.length === 0)}
			{fields.map((field, i) => (
				<Fragment key={field.config.api_accessor}>
					<FieldShell
						field={field}
						selected={selectedAccessor === field.config.api_accessor}
						invalid={invalidAccessors.has(field.config.api_accessor)}
						onSelect={(a) => onSelect(a)}
						onEdit={onEdit}
						onDuplicate={handleDuplicate}
						onDelete={handleDelete}
						labels={labels.shell}
					>
						<ShellContent field={field} labels={labels} />
					</FieldShell>
					{insertionRow(tabIndex, i + 1, false)}
				</Fragment>
			))}
		</Stack>
	);

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
				<Box ref={containerRef}>
					<Flex justify="flex-end" mb="2">
						{addSectionButton}
					</Flex>
					{renderFields(partition.tabs[0].fields, 0)}
				</Box>
			</FormProvider>
		);
	}

	return (
		<FormProvider {...methods}>
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
										<Input
											key={key}
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
									);
								}

								return (
									<Flex key={key} role="presentation" align="center" gap="0.5">
										<Tabs.Trigger value={`tab-${i}`}>
											{tab.section?.config.name ?? labels.defaultTab}
										</Tabs.Trigger>
										{tab.section && accessor && (
											<SectionMenu
												sectionAccessor={accessor}
												sectionName={tab.section.config.name}
												isFirst={i === firstSectionIndex}
												orientation={partition.orientation}
												onRename={(a) => setRenaming(a)}
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
		</FormProvider>
	);
}
EditorCanvas.displayName = "EditorCanvas";
