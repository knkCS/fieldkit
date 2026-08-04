import { Box, Flex, Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { useEffect, useState } from "react";
import { useWatch } from "react-hook-form";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { FieldProps } from "../../schema/plugin";
import type { PinningMode, Reference } from "../../schema/reference";
import { withPin } from "../../schema/reference";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { usePinTargets } from "../hooks/use-pin-targets";
import { useResolvedContentName } from "../hooks/use-resolved-content-name";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";
import { referencedContentIds, withoutExcluded } from "./exclude-referenced";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the person filling in the form reads. Serves both selects —
 * a Content and a Pin target reduce to exactly the same two things here. */
interface ContentOption {
	id: string;
	label: string;
}

/** How many Contents one open of the menu offers. A select shows what fits;
 * narrowing further is what the search box is for. The Reference Field's
 * drawer is the control for browsing a whole catalogue. */
const MENU_PAGE_SIZE = 50;

/**
 * What the second select is called, per kind of target it offers.
 *
 * Keyed by `PinningMode` rather than written as a ternary, so a third kind of
 * target could not be added without this naming it. Fieldkit names the two
 * kinds — the setting already does — without modelling either of them.
 */
const PIN_LABELS: Record<PinningMode, string> = {
	release: "Release",
	version: "Version",
};

/**
 * Exactly one Reference, picked from the Contents the reference Adapter
 * offers.
 *
 * Two things this control deliberately does not do:
 *
 * - **It never stores a name.** `onChange` writes `{ id }` and nothing else;
 *   the name on screen is resolved through the Adapter on every load, so a
 *   Content renamed elsewhere reads correctly here.
 * - **It never re-filters the Adapter's results by what was typed**
 *   (`filterOption={null}`). The Adapter decides what matches a query; fieldkit
 *   knows nothing about Content beyond an id and a display name (ADR-0002).
 *   The one thing it does drop is the Content it already holds, which is not a
 *   judgement about matching but the backstop behind an optional query field —
 *   see {@link withoutExcluded}.
 *
 * When the Field pins, a second select sits beside the first, listing what that
 * one Content may be pinned to. Two selects rather than the tree Field's
 * drawer, because with exactly one Reference there is nothing to browse: the
 * Content and its Release are both one click away.
 */
export function SingleReferenceField({
	field,
	readOnly,
}: FieldProps<SingleReferenceSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const adapter = adapters.reference;

	// A Consumer's settings object is a fresh literal on every render, and
	// effect deps must not churn with it.
	const blueprints = useStableValue(settings?.blueprints ?? []);

	// Absent reads as "does not pin", so a Spec authored before pinning existed
	// keeps its single select.
	const pinMode = settings?.pin_mode ?? "none";

	const value = useWatch({ name: accessor }) as Reference | null | undefined;
	const selectedId = value?.id ?? null;
	const pinnedId = value?.pin ?? null;

	// The one-item version of the tree Field's rule: the Content already stored
	// is not offered, so re-picking it is never proposed as a change. Read
	// through the same function the tree reads, so the two cannot drift. Held at
	// a stable identity because the menu searches on it.
	const excludeIds = useStableValue(referencedContentIds(value));

	const [options, setOptions] = useState<ContentOption[]>([]);
	const [searching, setSearching] = useState(false);
	const [query, setQuery] = useState("");
	const [menuOpen, setMenuOpen] = useState(false);
	// The option just picked, so the control shows its name straight away
	// instead of flashing the raw id while the Adapter confirms it. Kept only
	// while it still describes what is stored.
	const [picked, setPicked] = useState<ContentOption | null>(null);

	// The stored Content's current name. A Content that cannot be resolved —
	// deleted, or hidden from this person — keeps its id on screen rather than
	// vanishing, and the stored value is never rewritten.
	const resolvedName = useResolvedContentName(selectedId, accessor);

	const report = useAdapterErrorReporter(accessor, "Reference adapter failed");

	// Search only while the menu is open: a form can hold many Reference
	// Fields, and none of them should call the Adapter until someone looks.
	useEffect(() => {
		if (!adapter || !menuOpen) return;
		let cancelled = false;
		setSearching(true);
		adapter
			// No filters: this control has no room for a filter form, and an
			// empty record is what "no narrowing beyond the query" means.
			.search({
				blueprintIds: blueprints,
				query,
				filters: {},
				excludeIds,
				page: 1,
				page_size: MENU_PAGE_SIZE,
			})
			.then(({ items }) => {
				if (cancelled) return;
				// The same backstop the drawer applies, for the same reason: an
				// Adapter that ignores `excludeIds` must still not offer the
				// Content this Field already holds. There is no total here to go
				// approximate — a menu shows what fits.
				setOptions(
					withoutExcluded(items, excludeIds).map((item) => ({
						id: item.id,
						label: item.display_name,
					})),
				);
				setSearching(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setOptions([]);
				setSearching(false);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [adapter, blueprints, excludeIds, query, menuOpen, report]);

	// Unlike the Content search, this runs without waiting for a menu to open: a
	// stored Pin is an id, and the label beside it can only come from here —
	// there is no `fetch` for a Pin target.
	const { targets, loading: loadingPins } = usePinTargets(
		selectedId,
		pinMode,
		accessor,
	);

	const selected: ContentOption | null = selectedId
		? {
				id: selectedId,
				label:
					resolvedName ??
					(picked?.id === selectedId ? picked.label : null) ??
					selectedId,
			}
		: null;

	const pinOptions: ContentOption[] = targets.map((target) => ({
		id: target.id,
		label: target.label,
	}));

	// A Pin the Field no longer offers — what a `pin_mode` change leaves behind
	// — keeps its id on screen rather than vanishing, exactly as an unresolvable
	// Content does. The stored value is never rewritten: nulling a stranded Pin
	// is the Consumer's upgrade to do (ADR-0008).
	const pinned: ContentOption | null = pinnedId
		? (pinOptions.find((option) => option.id === pinnedId) ?? {
				id: pinnedId,
				label: pinnedId,
			})
		: null;

	// Null while the Field does not pin, which is also what keeps the lookup
	// above exhaustive over the kinds that do.
	const pinLabel = pinMode === "none" ? null : PIN_LABELS[pinMode];

	if (!adapter) {
		return (
			<FormField
				name={accessor}
				label={config.name}
				helperText={config.instructions || undefined}
				required={config.required}
				readOnly={readOnly}
			>
				{() => (
					<Text color="fg.muted" fontSize="sm">
						Reference adapter not configured
					</Text>
				)}
			</FormField>
		);
	}

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(formField) => (
				<Flex gap="2" align="start">
					<Box flex="1" minWidth="0">
						<BaseSelect<ContentOption>
							// Matches the `htmlFor` anker's FormField puts on the label,
							// so the label names react-select's input.
							inputId={accessor}
							aria-describedby={formField["aria-describedby"]}
							options={options}
							value={selected}
							// CLAUDE.md says to pass `readOnly`, not `disabled`, because
							// anker styles them differently. anker's `BaseSelect` exposes
							// only `disabled` (`BaseSelectProps`), so this is the one way
							// to stop a read-mode control being changed. The surrounding
							// `FormField` still gets `readOnly`, so the label and helper
							// text keep read-mode styling.
							disabled={readOnly}
							loading={searching}
							filterOption={null}
							inputValue={query}
							onInputChange={(next) => setQuery(next)}
							onMenuOpen={() => setMenuOpen(true)}
							onMenuClose={() => setMenuOpen(false)}
							onBlur={formField.onBlur}
							onChange={(next) => {
								const option = Array.isArray(next) ? next[0] : next;
								setPicked(option ?? null);
								if (!option) {
									formField.onChange(null);
									return;
								}
								// Re-picking the Content already stored changes nothing —
								// react-select reports it as a change all the same.
								if (option.id === selectedId) return;
								// A different Content is a different Reference, so the Pin
								// goes with it: a Pin can never point at a Release of
								// another Content. One Reference or none — never an
								// array, and never a name.
								formField.onChange({ id: option.id });
							}}
							placeholder="Search content..."
							noOptionsMessage={({ inputValue }) =>
								inputValue ? "No content matches" : "No content available"
							}
						/>
					</Box>

					{pinLabel && (
						<Box flex="1" minWidth="0">
							<BaseSelect<ContentOption>
								inputId={`${accessor}-pin`}
								// Its own name: anker's FormField label already names the
								// Content select, and two controls cannot share one label.
								aria-label={pinLabel}
								options={pinOptions}
								value={pinned}
								// Nothing to pin to until there is a Content to pin.
								disabled={readOnly || !selectedId}
								loading={loadingPins}
								onBlur={formField.onBlur}
								onChange={(next) => {
									const option = Array.isArray(next) ? next[0] : next;
									if (!selectedId) return;
									formField.onChange(
										withPin(value, selectedId, option?.id ?? null),
									);
								}}
								// Not a hint but the state itself: no Pin *is* the newest
								// Version, so an empty control has already said so.
								placeholder="Newest version"
								noOptionsMessage={() =>
									`No ${pinLabel.toLowerCase()} to pin to`
								}
							/>
						</Box>
					)}
				</Flex>
			)}
		</FormField>
	);
}
SingleReferenceField.displayName = "SingleReferenceField";
