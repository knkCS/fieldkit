import { Box } from "@chakra-ui/react";
import { DirtyDot } from "@knkcs/anker/atoms";
import { type FormMarkers, FormMarkersProvider } from "@knkcs/anker/forms";
import { Tabs } from "@knkcs/anker/primitives";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import { resolveMarkerConvention } from "../../schema/marker-convention";
import type { SpecPartition, SpecTab } from "../../schema/partition";
import { partitionSchemaBySections } from "../../schema/partition";
import { partitionTabByCards } from "../../schema/partition-cards";
import type { Schema } from "../../schema/types";
import { formatCount, mergeLabels } from "../merge-labels";
import { CardedFields, CardedReadTab } from "./carded-fields";
import { FieldSearch } from "./field-search";
import type { FieldSearchResult } from "./search-index";
import { SpecFormSkeleton } from "./spec-form-skeleton";
import { TabErrorBadge } from "./tab-error-badge";
import { TabShell, useTabShell } from "./tab-shell";
import { useTabIndicators } from "./use-tab-indicators";

function tabKey(tab: SpecTab, index: number): string {
	return tab.section?.config.api_accessor ?? `implicit-${index}`;
}

const FOCUSABLE_SELECTOR =
	"input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), [tabindex]";

// Focus (and, where possible, scroll to) the control for `accessor` inside
// `root`. Three fallbacks, in priority order:
//
//  (a) An element with a matching `name` attribute — register()-based
//      fields. Scoped to `root` (rather than the whole document) so two
//      SpecForms mounted on the same page can't steal each other's focus.
//  (b) Controller-based fields (reference, media, select) have no
//      focusable element with a `name` attribute, since their RHF ref
//      never lands on a real DOM node. anker's FormField always renders a
//      `<label htmlFor={accessor}>` though, so locate it and focus the
//      first focusable element in its Chakra Field.Root container (fall
//      back to the label's parent if there's no such container).
//  (c) Neither DOM query matched (e.g. an unrecognized field type) — fall
//      back to react-hook-form's own `setFocus`.
//
// Accessors can contain dots (nested paths), so escape them before use in
// attribute selectors.
function focusFieldByAccessor(
	root: HTMLElement | null,
	accessor: string,
	setFocus: (name: string) => void,
) {
	const escaped = CSS.escape(accessor);

	const named = root?.querySelector<HTMLElement>(`[name="${escaped}"]`);
	if (named) {
		named.focus();
		named.scrollIntoView?.({ block: "center", behavior: "smooth" });
		return;
	}

	const label = root?.querySelector<HTMLElement>(`label[for="${escaped}"]`);
	if (label) {
		label.scrollIntoView?.({ block: "center", behavior: "smooth" });
		// `[data-scope="field"]` is required alongside `[data-part="root"]`:
		// Chakra's Tabs.Root *also* renders `data-part="root"` (as
		// `data-scope="tabs"`), and it's an ancestor of every field, so an
		// unscoped `closest('[data-part="root"]')` matches the tab list
		// instead of the field's own Field.Root and focuses the first
		// focusable element in the whole tab strip (e.g. a tab trigger).
		const container =
			label.closest<HTMLElement>('[data-scope="field"][data-part="root"]') ??
			label.parentElement;
		container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
		return;
	}

	setFocus(accessor);
}

export interface SpecFormLabels {
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
	/** §10 optional marker shown after non-required labels when the form
	 * is mostly required. */
	optionalMarker?: string;
	/** Accessible name for a tab's error badge; "{count}" interpolated. */
	tabErrors?: string;
	/** Accessible name for a tab's error badge at count 1. */
	tabErrorsOne?: string;
	/** Accessible name for a tab's dirty dot. */
	unsavedChanges?: string;
	/** Accessible name for the field-search input. */
	searchLabel?: string;
	/** Read-mode fallback rendering of boolean true (cell-less plugins). */
	booleanYes?: string;
	/** Read-mode fallback rendering of boolean false (cell-less plugins). */
	booleanNo?: string;
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
	optionalMarker: "(optional)",
	tabErrors: "{count} invalid fields",
	tabErrorsOne: "1 invalid field",
	unsavedChanges: "Unsaved changes",
	searchLabel: "Find field",
	booleanYes: "Yes",
	booleanNo: "No",
};

interface SpecFormTabsProps {
	partition: SpecPartition;
	readOnly?: boolean;
	labels: Required<SpecFormLabels>;
}

function SpecFormTabs({ partition, readOnly, labels }: SpecFormTabsProps) {
	const {
		activeTab,
		setActiveTab,
		orientation,
		containerRef,
		rootRef,
		searchIndex,
	} = useTabShell(partition, labels.defaultTab);
	const indicators = useTabIndicators(partition.tabs);
	const { setFocus } = useFormContext();
	const { submitCount, errors } = useFormState();
	const lastHandledSubmit = useRef(0);

	// Target accessor for an in-flight jump, consumed by the effect below.
	// A ref (rather than state) because writing it must not itself trigger
	// a render — jumpToken is what schedules the effect run.
	const pendingJumpRef = useRef<string | null>(null);
	// Bumped on every jumpTo() call so the effect below re-runs even when
	// the target tab is already active, where `activeTab` wouldn't change.
	const [jumpToken, setJumpToken] = useState(0);

	// Switch to `tabIndex` and focus/scroll `accessor` once its panel is
	// mounted-visible. Shared by the submit-jump effect below and by
	// FieldSearch's cross-tab jump so there is one focus/scroll implementation.
	//
	// This can't be a single requestAnimationFrame after setActiveTab: a
	// single rAF can fire before React has committed the re-render that
	// makes the target panel's `hidden` attribute flip off, and focusing an
	// element inside a still-hidden panel silently fails. Instead, stash
	// the target and let the effect below do the focusing once `activeTab`
	// has actually rendered.
	const jumpTo = useCallback(
		(accessor: string, tabIndex: number) => {
			pendingJumpRef.current = accessor;
			setJumpToken((t) => t + 1);
			setActiveTab(`tab-${tabIndex}`);
		},
		[setActiveTab],
	);

	// Runs after the jump's target tab has rendered (both state updates in
	// jumpTo land in the same commit, so `activeTab` already reflects the
	// new tab by the time this runs). One more rAF inside: Chakra's tabs
	// flip the panel's `hidden` attribute in their own effect, which can
	// still be pending when this effect fires.
	// biome-ignore lint/correctness/useExhaustiveDependencies: jumpToken is a re-run trigger, not read in the effect body — pendingJumpRef carries the value
	useEffect(() => {
		const accessor = pendingJumpRef.current;
		if (accessor == null) return;
		pendingJumpRef.current = null;
		const raf = requestAnimationFrame(() => {
			focusFieldByAccessor(rootRef.current, accessor, setFocus);
		});
		return () => cancelAnimationFrame(raf);
	}, [jumpToken, setFocus]);

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

	const searchNode = searchIndex.length > 0 && (
		<FieldSearch
			index={searchIndex}
			placeholder={labels.searchPlaceholder}
			noResultsLabel={labels.noResults}
			label={labels.searchLabel}
			onJump={(result: FieldSearchResult) =>
				jumpTo(result.accessor, result.tabIndex)
			}
		/>
	);

	const tabTriggers = partition.tabs.map((tab, i) => (
		<Tabs.Trigger key={tabKey(tab, i)} value={`tab-${i}`}>
			{tab.section?.config.name ?? labels.defaultTab}
			{indicators[i].errorCount > 0 ? (
				<TabErrorBadge
					index={i}
					count={indicators[i].errorCount}
					label={formatCount(
						labels.tabErrorsOne,
						labels.tabErrors,
						indicators[i].errorCount,
					)}
				/>
			) : (
				indicators[i].dirty && (
					<Box as="span" data-testid={`tab-dirty-${i}`} ml="1.5">
						<DirtyDot label={labels.unsavedChanges} />
					</Box>
				)
			)}
		</Tabs.Trigger>
	));

	return (
		<TabShell
			orientation={orientation}
			containerRef={containerRef}
			rootRef={rootRef}
			activeTab={activeTab}
			onTabChange={setActiveTab}
			searchNode={searchNode}
			tabTriggers={tabTriggers}
		>
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<CardedFields fields={tab.fields} readOnly={readOnly} />
					</Box>
				</Tabs.Content>
			))}
		</TabShell>
	);
}
SpecFormTabs.displayName = "SpecFormTabs";

interface SpecFormReadTabsProps {
	partition: SpecPartition;
	values: Record<string, unknown>;
	labels: Required<SpecFormLabels>;
}

// Mirrors SpecFormTabs minus form hooks: no useTabIndicators (no RHF
// dirty/error state exists in read mode), no submit-jump effect. The "/"
// shortcut comes from FieldSearch itself (not duplicated here), and the
// search jump scrolls+flashes the target row instead of focusing a form
// control.
function SpecFormReadTabs({
	partition,
	values,
	labels,
}: SpecFormReadTabsProps) {
	const {
		activeTab,
		setActiveTab,
		orientation,
		containerRef,
		rootRef,
		searchIndex,
	} = useTabShell(partition, labels.defaultTab);

	// Same two-phase pattern as SpecFormTabs' jump: stash the target, bump
	// a token, and do the DOM work in an effect after the tab has rendered
	// (a lone rAF can fire before the panel's `hidden` flip has committed).
	const pendingJumpRef = useRef<string | null>(null);
	const [jumpToken, setJumpToken] = useState(0);
	const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// The element currently carrying the flash ring, so a second jump within
	// the fade window can clean up ITS ring (not just apply a new one to the
	// next target) — otherwise the first row's highlight never clears.
	const flashElRef = useRef<HTMLElement | null>(null);

	const jumpTo = useCallback(
		(accessor: string, tabIndex: number) => {
			pendingJumpRef.current = accessor;
			setJumpToken((t) => t + 1);
			setActiveTab(`tab-${tabIndex}`);
		},
		[setActiveTab],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: jumpToken is a re-run trigger, not read in the effect body — pendingJumpRef carries the value
	useEffect(() => {
		const accessor = pendingJumpRef.current;
		if (accessor == null) return;
		pendingJumpRef.current = null;
		const raf = requestAnimationFrame(() => {
			// Scoped to this instance's root (not document) and escaped:
			// dotted/nested accessors break a raw attribute selector.
			const el = rootRef.current?.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape(accessor)}"]`,
			);
			if (!el) return;
			el.scrollIntoView?.({ block: "center", behavior: "smooth" });
			// A second jump within the fade window must clean the previous
			// row's ring, or it stays highlighted forever.
			if (flashTimeoutRef.current != null) {
				clearTimeout(flashTimeoutRef.current);
				if (flashElRef.current) {
					flashElRef.current.style.transition = "none";
					flashElRef.current.style.boxShadow = "none";
				}
			}
			// Appear instantly (no transition), fade out later: setting the
			// transition in the same tick as the ring would animate the
			// APPEARANCE too, leaving the highlight near-invisible right when
			// the user lands on the row.
			el.style.transition = "none";
			el.style.boxShadow = "0 0 0 3px var(--chakra-colors-primary-200)";
			flashElRef.current = el;
			flashTimeoutRef.current = setTimeout(() => {
				el.style.transition = "box-shadow 1.5s ease";
				el.style.boxShadow = "none";
				flashTimeoutRef.current = null;
				flashElRef.current = null;
			}, 1500);
		});
		return () => cancelAnimationFrame(raf);
	}, [jumpToken]);

	// A pending flash must not fire against an unmounted tree.
	useEffect(
		() => () => {
			if (flashTimeoutRef.current != null) {
				clearTimeout(flashTimeoutRef.current);
			}
			flashTimeoutRef.current = null;
			flashElRef.current = null;
		},
		[],
	);

	const searchNode = searchIndex.length > 0 && (
		<FieldSearch
			index={searchIndex}
			placeholder={labels.searchPlaceholder}
			noResultsLabel={labels.noResults}
			label={labels.searchLabel}
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
		<TabShell
			orientation={orientation}
			containerRef={containerRef}
			rootRef={rootRef}
			activeTab={activeTab}
			onTabChange={setActiveTab}
			searchNode={searchNode}
			tabTriggers={tabTriggers}
		>
			{partition.tabs.map((tab, i) => (
				<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
					<Box pt="4">
						<CardedReadTab
							tab={tab}
							values={values}
							labels={{
								booleanYes: labels.booleanYes,
								booleanNo: labels.booleanNo,
							}}
						/>
					</Box>
				</Tabs.Content>
			))}
		</TabShell>
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
	const resolvedLabels = mergeLabels(DEFAULT_LABELS, labels);
	const partition = useMemo(() => partitionSchemaBySections(schema), [schema]);
	const convention = useMemo(() => resolveMarkerConvention(schema), [schema]);
	// Memoized so the context value doesn't change identity every render
	// (a fresh object each render would re-render every FormField subtree).
	const markers = useMemo<FormMarkers>(
		() =>
			convention === "optional-text"
				? {
						showRequiredIndicator: false,
						optionalText: resolvedLabels.optionalMarker,
						dirtyLabel: resolvedLabels.unsavedChanges,
					}
				: { dirtyLabel: resolvedLabels.unsavedChanges },
		[convention, resolvedLabels.optionalMarker, resolvedLabels.unsavedChanges],
	);

	// `loading` must win over the empty-schema short-circuit below: a
	// consumer fetching the spec itself passes `schema={[]} loading` until
	// the real spec arrives, and needs the skeleton rather than nothing.
	if (loading) {
		// Skeleton draws inside card frames when the FIRST tab is carded —
		// the first tab is what's visible while loading.
		const firstTabCards = partitionTabByCards(partition.tabs[0]?.fields ?? []);
		return (
			<SpecFormSkeleton
				fieldCount={schema.length}
				showTabStrip={partition.hasSections}
				cardSizes={
					firstTabCards.hasCards
						? firstTabCards.cards.map((c) => c.fields.length)
						: undefined
				}
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
			return (
				<CardedReadTab
					tab={partition.tabs[0]}
					values={readValues}
					labels={{
						booleanYes: resolvedLabels.booleanYes,
						booleanNo: resolvedLabels.booleanNo,
					}}
				/>
			);
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
			<FormMarkersProvider value={markers}>
				<CardedFields fields={partition.tabs[0].fields} readOnly={readOnly} />
			</FormMarkersProvider>
		);
	}

	return (
		<FormMarkersProvider value={markers}>
			<SpecFormTabs
				partition={partition}
				readOnly={readOnly}
				labels={resolvedLabels}
			/>
		</FormMarkersProvider>
	);
}
SpecForm.displayName = "SpecForm";
