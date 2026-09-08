import { Box, Flex, Text } from "@chakra-ui/react";
import {
	type BaseOption,
	BaseSelect,
	type LookupPage,
	type LookupResolveArgs,
	type LookupSearchArgs,
	LookupSelect,
} from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { useCallback } from "react";
import { useWatch } from "react-hook-form";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { FieldProps } from "../../schema/plugin";
import type { PinningMode, Reference } from "../../schema/reference";
import { withPin } from "../../schema/reference";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { usePinTargets } from "../hooks/use-pin-targets";
import { useStableValue } from "../hooks/use-stable-value";
import { useFieldKit } from "../provider";
import { referencedContentIds, withoutExcluded } from "./exclude-referenced";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the person filling in the form reads. Serves both selects —
 * a Content and a Pin target reduce to exactly the same two things here. */
interface ContentOption extends BaseOption {
	id: string;
	label: string;
}

/** How many Contents one page of the menu offers. The Adapter pages; this is
 * the size fieldkit asks in. Scrolling to the bottom asks for the next one, so
 * this is a page size and not a ceiling. */
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
 * **The Content select owns no asynchrony.** Debounce, menu-open gating,
 * request cancellation, the stale-answer guard, page accumulation, loading and
 * failure presentation, and the resolved → just-picked → raw-id label chain all
 * belong to anker's `LookupSelect` (anker ADR-0002), exactly as they do for
 * `LookupField`. There is one async select in fieldkit and this is not a second
 * one; what is left here is the half the atom deliberately does not have —
 * asking the reference Adapter, translating between the page its surface asks
 * in and the cursor the atom pages by, keeping the Content already held out of
 * the menu, and reporting a failure on the Consumer's own channel.
 *
 * Two things this control deliberately does not do:
 *
 * - **It never stores a name.** `onChange` writes `{ id }` and nothing else;
 *   the name on screen is resolved through the Adapter on every load, so a
 *   Content renamed elsewhere reads correctly here.
 * - **It never re-filters the Adapter's results by what was typed.** The
 *   Adapter decides what matches a query; fieldkit knows nothing about Content
 *   beyond an id and a display name (ADR-0002), and the atom turns client-side
 *   filtering off for the same reason. The one thing it does drop is the
 *   Content it already holds, which is not a judgement about matching but the
 *   backstop behind an optional query field — see {@link withoutExcluded}.
 *
 * When the Field pins, a second select sits beside the first, listing what that
 * one Content may be pinned to. That one is **not** a Lookup and must not
 * become one: its targets are fetched whole by {@link usePinTargets} the moment
 * a Content is chosen, so it is a plain `BaseSelect` over an array that is
 * already in hand. Two selects rather than the tree Field's drawer, because
 * with exactly one Reference there is nothing to browse: the Content and its
 * Release are both one click away.
 */
export function SingleReferenceField({
	field,
	readOnly,
}: FieldProps<SingleReferenceSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const adapter = adapters.reference;

	// A Consumer's settings object is a fresh literal on every render, and the
	// search callback's deps must not churn with it.
	const blueprints = useStableValue(settings?.blueprints ?? []);

	// Absent reads as "does not pin", so a Spec authored before pinning existed
	// keeps its single select.
	const pinMode = settings?.pin_mode ?? "none";

	const value = useWatch({ name: accessor }) as Reference | null | undefined;
	// Narrowed rather than passed straight through. `?? null` alone would let
	// `""` past, and a bare id is what the atom resolves — so the select would
	// hold an item with a blank label, suppress its placeholder and offer a
	// clear button, looking like a Reference whose name failed to load. The old
	// control could not show that, because it built its own option object and
	// `""` was falsy at the branch that built it; the guard has to be explicit
	// now. `id` is `z.string().min(1)` in the Schema, so this only ever catches
	// form state that has not been validated yet — a Consumer's `defaultValues`,
	// most of all — which is the same reason `LookupField` narrows its own.
	const rawId = value?.id;
	const selectedId = typeof rawId === "string" && rawId !== "" ? rawId : null;
	const pinnedId = value?.pin ?? null;

	// The one-item version of the tree Field's rule: the Content already stored
	// is not offered, so re-picking it is never proposed as a change. Read
	// through the same function the tree reads, so the two cannot drift. Held at
	// a stable identity because the menu searches on it.
	const excludeIds = useStableValue(referencedContentIds(value));

	const report = useAdapterErrorReporter(accessor, "Reference adapter failed");

	const search = useCallback(
		async ({
			query,
			cursor,
		}: LookupSearchArgs): Promise<LookupPage<ContentOption>> => {
			// Unreachable while an Adapter is configured — the degrade path below
			// returns before the control is rendered — but the callback is built
			// unconditionally, as hooks must be.
			if (!adapter) return { items: [] };

			// The cursor is fieldkit's own: the next page number, as a string. The
			// atom treats it as opaque and hands it straight back, which is what
			// lets one adapter surface ask in pages while the atom pages by cursor
			// (ADR-0015).
			// `|| 1` because a cursor is only ever this callback's own
			// `String(page + 1)` — so anything unparseable means the cursor did not
			// come from here, and page one is the only safe thing to ask for. NaN
			// would otherwise reach the Adapter as a page number.
			const page = (cursor ? Number.parseInt(cursor, 10) : 1) || 1;
			try {
				const { items, total } = await adapter.search({
					blueprintIds: blueprints,
					// No filters: this control has no room for a filter form, and an
					// empty record is what "no narrowing beyond the query" means.
					filters: {},
					query,
					excludeIds,
					page,
					page_size: MENU_PAGE_SIZE,
				});
				return {
					// The same backstop the drawer applies, for the same reason: an
					// Adapter that ignores `excludeIds` must still not offer the
					// Content this Field already holds.
					items: withoutExcluded(items, excludeIds).map((item) => ({
						id: item.id,
						label: item.display_name,
					})),
					// Counted on what the *Adapter* returned, not on what survived the
					// backstop: paging is the Adapter's cut of its own catalogue, and
					// an excluded row still occupied a place in the page it sent.
					//
					// `total` is what says whether there is another page — only the
					// Adapter knows it. The arrived-item count is the backstop the
					// total cannot be: an Adapter that answered with nothing has
					// reached the end however high its total claims to be, and that
					// guard rather than the number is what makes the loop terminate
					// against a total that is wrong, stale, or larger than it can
					// actually serve.
					//
					// Stateless, and therefore assuming every *earlier* page was full
					// — which is the page/total contract, and the only thing a request
					// can know without carrying a running count across a sequence the
					// atom may abandon or restart at any point.
					nextCursor:
						items.length > 0 &&
						(page - 1) * MENU_PAGE_SIZE + items.length < total
							? String(page + 1)
							: null,
				};
			} catch (error) {
				// Reported here and re-thrown: the Consumer hears about the failure
				// on its own channel, and the atom still turns it into the failure
				// line in the menu.
				report(error);
				throw error;
			}
		},
		[adapter, blueprints, excludeIds, report],
	);

	const resolve = useCallback(
		async ({ ids }: LookupResolveArgs): Promise<ContentOption[]> => {
			if (!adapter) return [];
			try {
				return (await adapter.fetch(ids)).map((item) => ({
					id: item.id,
					label: item.display_name,
				}));
			} catch (error) {
				report(error);
				// The atom keeps the raw id on screen and forgets the attempt, so a
				// later change to the value can try again.
				throw error;
			}
		},
		[adapter, report],
	);

	// Unlike the Content search, this runs without waiting for a menu to open: a
	// stored Pin is an id, and the label beside it can only come from here —
	// there is no `fetch` for a Pin target.
	const { targets, loading: loadingPins } = usePinTargets(
		selectedId,
		pinMode,
		accessor,
	);

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
						<LookupSelect<ContentOption>
							// Matches the `htmlFor` anker's FormField puts on the label,
							// so the label names react-select's input.
							inputId={accessor}
							aria-describedby={formField["aria-describedby"]}
							// A bare id is exactly what the atom's `LookupValue` accepts,
							// and handing it one is what puts the resolver to work.
							value={selectedId}
							search={search}
							resolve={resolve}
							// CLAUDE.md says to pass `readOnly`, not `disabled`, because
							// anker styles them differently. The select exposes only
							// `disabled` (`BaseSelectProps`), so this is the one way to
							// stop a read-mode control being changed. The surrounding
							// `FormField` still gets `readOnly`, so the label and helper
							// text keep read-mode styling.
							disabled={readOnly}
							onBlur={formField.onBlur}
							onChange={(next) => {
								const option = Array.isArray(next) ? next[0] : next;
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
							emptyMessage="No content matches"
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
