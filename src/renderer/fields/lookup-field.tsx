import { Box, Text } from "@chakra-ui/react";
import {
	type BaseOption,
	chakraComponents,
	type GroupBase,
	type LookupPage,
	type LookupResolveArgs,
	type LookupSearchArgs,
	LookupSelect,
	type OptionProps,
} from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { useCallback } from "react";
import { useWatch } from "react-hook-form";
import type { LookupSettings } from "../../schema/field-types/lookup";
import type { FieldProps } from "../../schema/plugin";
import type { LookupItem } from "../adapters";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { useFieldKit } from "../provider";

/**
 * A Source's item as the select sees it. `id` is the value and `label` is what
 * the person filling in the form reads — anker's `BaseOption`, plus the second
 * line a {@link LookupItem} may carry.
 */
interface LookupOption extends BaseOption {
	description?: string;
}

/**
 * How many items one page of the menu offers.
 *
 * The Source pages; this is the size fieldkit asks in. Scrolling to the bottom
 * asks for the next one, so this is a page size and not a ceiling.
 */
const LOOKUP_PAGE_SIZE = 50;

function toOption(item: LookupItem): LookupOption {
	return { id: item.id, label: item.label, description: item.description };
}

/**
 * One row in the menu: the label, and the second line that tells two items
 * apart.
 *
 * Defined at module scope so react-select never remounts an open menu, and
 * composed over `chakraComponents.Option` exactly as anker's own `BaseSelect`
 * composes its renderers. It exists because {@link LookupItem} declares a
 * `description` — a control that accepted one and dropped it would be
 * describing something it does not do.
 */
const LookupOptionRow = ({
	data,
	...props
}: OptionProps<LookupOption, boolean, GroupBase<LookupOption>>) => (
	<chakraComponents.Option data={data} {...props}>
		<Box minWidth="0">
			<Text>{data.label}</Text>
			{data.description && (
				<Text fontSize="xs" color="fg.muted">
					{data.description}
				</Text>
			)}
		</Box>
	</chakraComponents.Option>
);
LookupOptionRow.displayName = "LookupOptionRow";

/** Hoisted for the same reason the row itself is: a fresh object every render
 * is a fresh `components` map for react-select to work through. */
const LOOKUP_COMPONENTS = { Option: LookupOptionRow };

/**
 * Exactly one id, picked from the Source this Field names.
 *
 * **This control owns no asynchrony.** Debounce, menu-open gating, request
 * cancellation, the stale-answer guard, page accumulation, loading and failure
 * presentation, and the resolved → just-picked → raw-id label chain all belong
 * to anker's `LookupSelect` (anker ADR-0002). What is left here is the half the
 * atom deliberately does not have: finding the Source, translating between the
 * page fieldkit's adapter surface asks in and the cursor the atom pages by, and
 * reporting a failure on the Consumer's own channel.
 *
 * Two things it deliberately does not do:
 *
 * - **It never stores a label.** `onChange` writes the id and nothing else; the
 *   label on screen is resolved through the Source on every load, so an item
 *   renamed elsewhere reads correctly here.
 * - **It never re-filters what the Source returned.** The Source is the filter
 *   — fieldkit knows nothing about what is in one beyond an id and a label
 *   (ADR-0002). The atom turns client-side filtering off for the same reason.
 */
export function LookupField({ field, readOnly }: FieldProps<LookupSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;

	const sourceId = settings?.source ?? "";
	const source = sourceId ? adapters.lookup?.[sourceId] : undefined;

	const value = useWatch({ name: accessor }) as string | null | undefined;
	const selectedId = value ?? null;

	const report = useAdapterErrorReporter(accessor, "Lookup source failed");

	const search = useCallback(
		async ({
			query,
			cursor,
		}: LookupSearchArgs): Promise<LookupPage<LookupOption>> => {
			// Unreachable while a Source is configured — the degrade paths below
			// return before the control is rendered — but the callback is built
			// unconditionally, as hooks must be.
			if (!source) return { items: [] };

			// The cursor is fieldkit's own: the next page number, as a string. The
			// atom treats it as opaque and hands it straight back, which is what
			// lets one adapter surface ask in pages while the atom pages by cursor
			// (ADR-0015).
			const page = cursor ? Number.parseInt(cursor, 10) : 1;
			try {
				const { items, total } = await source.search({
					query,
					page,
					page_size: LOOKUP_PAGE_SIZE,
				});
				const options = items.map(toOption);
				// Counted from what actually arrived rather than from `page *
				// LOOKUP_PAGE_SIZE`, so a Source that answers with a short page is
				// not asked for a page beyond the end — and an empty answer always
				// stops, whatever the total claims.
				const seen = (page - 1) * LOOKUP_PAGE_SIZE + options.length;
				return {
					items: options,
					nextCursor:
						options.length > 0 && seen < total ? String(page + 1) : null,
				};
			} catch (error) {
				// Reported here and re-thrown: the Consumer hears about the failure
				// on its own channel, and the atom still turns it into the failure
				// line in the menu.
				report(error);
				throw error;
			}
		},
		[source, report],
	);

	const resolve = useCallback(
		async ({ ids }: LookupResolveArgs): Promise<LookupOption[]> => {
			const resolveByIds = source?.resolveByIds;
			if (!resolveByIds) return [];
			try {
				return (await resolveByIds(ids)).map(toOption);
			} catch (error) {
				report(error);
				// The atom keeps the raw id on screen and forgets the attempt, so a
				// later change to the value can try again.
				throw error;
			}
		},
		[source, report],
	);

	if (!source) {
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
						{/* Two different mistakes, said apart. A Field that names no
						    Source was never finished; a Field naming one nobody
						    registered is a Consumer wiring gap, and only naming the id
						    makes it findable. Neither throws — a missing adapter
						    degrades visibly (ADR-0009). */}
						{sourceId
							? `Lookup source "${sourceId}" is not registered`
							: "No lookup source configured"}
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
				<LookupSelect<LookupOption>
					// Matches the `htmlFor` anker's FormField puts on the label, so
					// the label names react-select's input.
					inputId={accessor}
					aria-describedby={formField["aria-describedby"]}
					// A bare id is exactly what the atom's `LookupValue` accepts, and
					// handing it one is what puts the resolver to work.
					value={selectedId}
					search={search}
					// Presence is the signal: absent, the atom shows a stored id as
					// itself rather than resolving it. A Source without `resolveByIds`
					// must therefore contribute no resolver at all, not one that
					// answers with nothing.
					resolve={source.resolveByIds ? resolve : undefined}
					// CLAUDE.md says to pass `readOnly`, not `disabled`, because anker
					// styles them differently. The select exposes only `disabled`, so
					// this is the one way to stop a read-mode control being changed;
					// the surrounding `FormField` still gets `readOnly`.
					disabled={readOnly}
					onBlur={formField.onBlur}
					onChange={(next) => {
						const option = Array.isArray(next) ? next[0] : next;
						// The id and nothing else — never an object, never an array,
						// and never a label (ADR-0015).
						formField.onChange(option?.id ?? null);
					}}
					components={LOOKUP_COMPONENTS}
					placeholder="Search…"
				/>
			)}
		</FormField>
	);
}
LookupField.displayName = "LookupField";
