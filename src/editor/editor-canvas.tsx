// src/editor/editor-canvas.tsx
import { Box, Flex, Stack, Text } from "@chakra-ui/react";
import { Tabs } from "@knkcs/anker/primitives";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { FieldComponent } from "../renderer/field-component";
import { FieldSearch } from "../renderer/spec-form/field-search";
import { useContainerOrientation } from "../renderer/spec-form/use-container-orientation";
import type { Field } from "../schema/types";
import { getDefaultValues } from "../schema/zod-builder";
import { duplicateField, removeField } from "./draft-ops";
import type { FieldShellToolbarLabels } from "./field-shell";
import { FieldShell } from "./field-shell";
import type { SpecDraft } from "./use-spec-draft";

interface CanvasLabels {
	defaultTab: string;
	searchPlaceholder: string;
	noResults: string;
	hiddenField: string; // e.g. "Hidden field:" prefix
	groupPreview: string; // e.g. "Repeating group" — child count appended
	shell: FieldShellToolbarLabels;
}

export interface EditorCanvasProps {
	spec: SpecDraft;
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
	selectedAccessor,
	onSelect,
	onEdit,
	labels,
}: EditorCanvasProps) {
	const { partition, draft, apply } = spec;
	const [activeTab, setActiveTab] = useState("tab-0");
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

	const renderFields = (fields: Field[]) => (
		<Stack gap="5">
			{fields.map((field) => (
				<FieldShell
					key={field.config.api_accessor}
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
			))}
		</Stack>
	);

	if (partition.tabs.length === 0) {
		return (
			<FormProvider {...methods}>
				<Box
					data-testid="editor-canvas-empty"
					color="fg.muted"
					p="6"
					textAlign="center"
				>
					{/* empty-spec drop zone arrives with insertion (T6) */}
				</Box>
			</FormProvider>
		);
	}

	if (!partition.hasSections) {
		return (
			<FormProvider {...methods}>
				<Box ref={containerRef}>{renderFields(partition.tabs[0].fields)}</Box>
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
							{partition.tabs.map((tab, i) => (
								<Tabs.Trigger
									key={tab.section?.config.api_accessor ?? `implicit-${i}`}
									value={`tab-${i}`}
								>
									{tab.section?.config.name ?? labels.defaultTab}
								</Tabs.Trigger>
							))}
						</Tabs.List>
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
							<Box pt="4">{renderFields(tab.fields)}</Box>
						</Tabs.Content>
					))}
				</Tabs.Root>
			</Box>
		</FormProvider>
	);
}
EditorCanvas.displayName = "EditorCanvas";
