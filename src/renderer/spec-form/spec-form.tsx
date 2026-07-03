import { Box } from "@chakra-ui/react";
import { DirtyDot } from "@knkcs/anker/atoms";
import { Tabs } from "@knkcs/anker/primitives";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import type { SpecPartition, SpecTab } from "../../schema/partition";
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { FieldSearch } from "./field-search";
import { ReadTab } from "./read-tab";
import type { FieldSearchResult } from "./search-index";
import { buildSearchIndex } from "./search-index";
import { SpecFormSkeleton } from "./spec-form-skeleton";
import { useContainerOrientation } from "./use-container-orientation";
import { useTabIndicators } from "./use-tab-indicators";

function tabKey(tab: SpecTab, index: number): string {
	return tab.section?.config.api_accessor ?? `implicit-${index}`;
}

export interface SpecFormLabels {
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
}

export interface SpecFormProps {
	schema: Schema;
	mode?: "edit" | "read";
	readOnly?: boolean;
	loading?: boolean;
	/** Read-mode data source; ignored in edit mode. */
	values?: Record<string, unknown>;
	labels?: SpecFormLabels;
}

export const DEFAULT_LABELS: Required<SpecFormLabels> = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
};

interface SpecFormTabsProps {
	partition: SpecPartition;
	readOnly?: boolean;
	labels: Required<SpecFormLabels>;
}

function SpecFormTabs({ partition, readOnly, labels }: SpecFormTabsProps) {
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);
	const rootRef = useRef<HTMLDivElement>(null);
	const indicators = useTabIndicators(partition.tabs);
	const { setFocus } = useFormContext();
	const { submitCount, errors } = useFormState();
	const lastHandledSubmit = useRef(0);
	const searchIndex = useMemo(
		() => buildSearchIndex(partition.tabs, labels.defaultTab),
		[partition, labels.defaultTab],
	);

	// Reset to the first tab when the partition identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: partition is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition]);

	// Switch to `tabIndex` and focus/scroll `accessor` once its panel is
	// mounted-visible. Shared by the submit-jump effect below and by
	// FieldSearch's cross-tab jump so there is one focus/scroll implementation.
	const jumpTo = useCallback(
		(accessor: string, tabIndex: number) => {
			setActiveTab(`tab-${tabIndex}`);
			// Wait one frame so the target panel is visible before focusing.
			requestAnimationFrame(() => {
				setFocus(accessor);
				document
					.getElementsByName(accessor)[0]
					?.scrollIntoView?.({ block: "center", behavior: "smooth" });
			});
		},
		[setFocus],
	);

	// After a failed submit, jump to the tab holding the first errored field
	// and focus it. `useTabIndicators` (Task 8) also subscribes to
	// `useFormState` for the same render — RHF supports multiple
	// subscriptions to the same form, so both hooks stay independent.
	useEffect(() => {
		// RHF's reset() (e.g. EditDrawer resetting on a new row's defaults)
		// restarts submitCount at 0 without resetting this ref, so a
		// post-reset submitCount can collide with a pre-reset value already
		// recorded here. Detect the rewind and re-baseline before the
		// early-return check below, or a post-reset failing submit whose
		// count collides with the old one would be silently skipped.
		if (submitCount < lastHandledSubmit.current) lastHandledSubmit.current = 0;
		if (submitCount === 0 || submitCount === lastHandledSubmit.current) return;
		lastHandledSubmit.current = submitCount;

		for (let i = 0; i < partition.tabs.length; i++) {
			const errored = partition.tabs[i].fields.find(
				(f) => errors[f.config.api_accessor],
			);
			if (errored) {
				jumpTo(errored.config.api_accessor, i);
				return;
			}
		}
	}, [submitCount, errors, partition, jumpTo]);

	// "/" focuses the search unless the user is typing in a field.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "/") return;
			const active = document.activeElement;
			if (
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				(active instanceof HTMLElement && active.isContentEditable)
			)
				return;
			const input = rootRef.current?.querySelector<HTMLInputElement>(
				"[data-field-search-input]",
			);
			if (input) {
				e.preventDefault();
				input.focus();
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	const searchNode = searchIndex.length > 0 && (
		<FieldSearch
			index={searchIndex}
			placeholder={labels.searchPlaceholder}
			noResultsLabel={labels.noResults}
			onJump={(result: FieldSearchResult) =>
				jumpTo(result.accessor, result.tabIndex)
			}
		/>
	);

	// Merge the callback ref from useContainerOrientation with a plain
	// RefObject the "/" shortcut effect can query synchronously. Memoized so
	// its identity is stable across renders — otherwise React would detach
	// and reattach containerRef (and its ResizeObserver) on every render.
	const setRoot = useCallback(
		(node: HTMLDivElement | null) => {
			rootRef.current = node;
			containerRef(node);
		},
		[containerRef],
	);

	const tabTriggers = partition.tabs.map((tab, i) => (
		<Tabs.Trigger key={tabKey(tab, i)} value={`tab-${i}`}>
			{tab.section?.config.name ?? labels.defaultTab}
			{indicators[i].errorCount > 0 ? (
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
					{indicators[i].errorCount}
				</Box>
			) : (
				indicators[i].dirty && (
					<Box as="span" data-testid={`tab-dirty-${i}`} ml="1.5">
						<DirtyDot />
					</Box>
				)
			)}
		</Tabs.Trigger>
	));

	return (
		<Box ref={setRoot}>
			{/* Vertical Tabs.Root is a row-flex container (nav column beside
			    content), so the search must live OUTSIDE it to span the full
			    width above nav+content instead of becoming a row item. */}
			{orientation === "vertical" && searchNode && (
				<Box mb="3">{searchNode}</Box>
			)}
			<Tabs.Root
				value={activeTab}
				onValueChange={(e) => setActiveTab(e.value)}
				orientation={orientation}
				// NEVER pass lazyMount/unmountOnExit: RHF needs all panels in the DOM.
			>
				{orientation === "horizontal" ? (
					<Box
						display="flex"
						alignItems="center"
						justifyContent="space-between"
						gap="4"
					>
						<Tabs.List flex="1">{tabTriggers}</Tabs.List>
						{searchNode}
					</Box>
				) : (
					<Tabs.List>{tabTriggers}</Tabs.List>
				)}
				{partition.tabs.map((tab, i) => (
					<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
						<Box pt="4">
							<FieldRenderer schema={tab.fields} readOnly={readOnly} />
						</Box>
					</Tabs.Content>
				))}
			</Tabs.Root>
		</Box>
	);
}
SpecFormTabs.displayName = "SpecFormTabs";

interface SpecFormReadTabsProps {
	partition: SpecPartition;
	values: Record<string, unknown>;
	labels: Required<SpecFormLabels>;
}

// Mirrors SpecFormTabs minus form hooks: no useTabIndicators (no RHF
// dirty/error state exists in read mode), no submit-jump effect, no
// setFocus/"/" shortcut. The search jump scrolls+flashes the target row
// instead of focusing a form control.
function SpecFormReadTabs({
	partition,
	values,
	labels,
}: SpecFormReadTabsProps) {
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);
	const searchIndex = useMemo(
		() => buildSearchIndex(partition.tabs, labels.defaultTab),
		[partition, labels.defaultTab],
	);

	// Reset to the first tab when the partition identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: partition is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition]);

	const jumpTo = useCallback((accessor: string, tabIndex: number) => {
		setActiveTab(`tab-${tabIndex}`);
		// Wait one frame so the target panel is visible before scrolling.
		requestAnimationFrame(() => {
			const el = document.querySelector<HTMLElement>(
				`[data-field-row="${accessor}"]`,
			);
			el?.scrollIntoView?.({ block: "center", behavior: "smooth" });
			if (el) {
				el.style.transition = "box-shadow 1.5s ease";
				el.style.boxShadow = "0 0 0 3px var(--chakra-colors-primary-200)";
				setTimeout(() => {
					el.style.boxShadow = "none";
				}, 1500);
			}
		});
	}, []);

	const searchNode = searchIndex.length > 0 && (
		<FieldSearch
			index={searchIndex}
			placeholder={labels.searchPlaceholder}
			noResultsLabel={labels.noResults}
			onJump={(result: FieldSearchResult) =>
				jumpTo(result.accessor, result.tabIndex)
			}
		/>
	);

	const tabTriggers = partition.tabs.map((tab, i) => (
		<Tabs.Trigger key={tabKey(tab, i)} value={`tab-${i}`}>
			{tab.section?.config.name ?? labels.defaultTab}
		</Tabs.Trigger>
	));

	return (
		<Box ref={containerRef}>
			{/* Vertical Tabs.Root is a row-flex container (nav column beside
			    content), so the search must live OUTSIDE it to span the full
			    width above nav+content instead of becoming a row item. */}
			{orientation === "vertical" && searchNode && (
				<Box mb="3">{searchNode}</Box>
			)}
			<Tabs.Root
				value={activeTab}
				onValueChange={(e) => setActiveTab(e.value)}
				orientation={orientation}
			>
				{orientation === "horizontal" ? (
					<Box
						display="flex"
						alignItems="center"
						justifyContent="space-between"
						gap="4"
					>
						<Tabs.List flex="1">{tabTriggers}</Tabs.List>
						{searchNode}
					</Box>
				) : (
					<Tabs.List>{tabTriggers}</Tabs.List>
				)}
				{partition.tabs.map((tab, i) => (
					<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
						<Box pt="4">
							<ReadTab tab={tab} values={values} />
						</Box>
					</Tabs.Content>
				))}
			</Tabs.Root>
		</Box>
	);
}
SpecFormReadTabs.displayName = "SpecFormReadTabs";

export function SpecForm({
	schema,
	mode = "edit",
	readOnly,
	loading,
	values,
	labels,
}: SpecFormProps) {
	const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
	const partition = useMemo(() => partitionSchemaBySections(schema), [schema]);

	// `loading` must win over the empty-schema short-circuit below: a
	// consumer fetching the spec itself passes `schema={[]} loading` until
	// the real spec arrives, and needs the skeleton rather than nothing.
	if (loading) {
		return (
			<SpecFormSkeleton
				fieldCount={schema.length}
				showTabStrip={partition.hasSections}
			/>
		);
	}

	if (partition.tabs.length === 0) return null;

	// Read mode never touches react-hook-form hooks — it must render without
	// a FormProvider in the tree, so this branch runs before any edit-mode
	// path that calls useFormContext/useFormState.
	if (mode === "read") {
		const readValues = values ?? {};
		if (!partition.hasSections) {
			return <ReadTab tab={partition.tabs[0]} values={readValues} />;
		}
		return (
			<SpecFormReadTabs
				partition={partition}
				values={readValues}
				labels={resolvedLabels}
			/>
		);
	}

	if (!partition.hasSections) {
		return (
			<FieldRenderer schema={partition.tabs[0].fields} readOnly={readOnly} />
		);
	}

	return (
		<SpecFormTabs
			partition={partition}
			readOnly={readOnly}
			labels={resolvedLabels}
		/>
	);
}
SpecForm.displayName = "SpecForm";
