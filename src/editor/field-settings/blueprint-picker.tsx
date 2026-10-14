// src/editor/field-settings/blueprint-picker.tsx
import { Box, Button, chakra, HStack, Text } from "@chakra-ui/react";
import {
	type BaseOption,
	type GroupBase,
	type LookupPage,
	type LookupResolveArgs,
	type LookupSearchArgs,
	LookupSelect,
	type SelectInstance,
} from "@knkcs/anker/atoms";
import { useCallback, useId, useRef, useState } from "react";
import type {
	BlueprintPurpose,
	PickerPage,
	PickerResolveQuery,
	PickerSearchQuery,
	ResolvedChoice,
} from "../../renderer/adapters";
import { useAdapterErrorReporter } from "../../renderer/hooks/use-adapter-error-reporter";
import { useFieldKit } from "../../renderer/provider";
import { SettingLockReason, useSettingLock } from "./setting-lock";

/** One choice as a picker source names it: what a setting stores, and what
 * the Author reads. A Blueprint or a Text Type Release alike. */
interface PickerChoice {
	id: string;
	name: string;
}

/**
 * Where a picker's choices come from: an Adapter's `search`, with the purpose
 * already bound, and its optional `resolve`. Built by
 * {@link useBlueprintSource} for the Blueprint settings and by the rich_text
 * settings for the Text Type; `undefined` when the Consumer offers no
 * `search`, which is the "no source" state (ADR-0027).
 */
export interface PickerSource {
	search: (query: PickerSearchQuery) => Promise<PickerPage<PickerChoice>>;
	resolve?: (
		query: PickerResolveQuery,
	) => Promise<ResolvedChoice<PickerChoice>[]>;
}

/**
 * The `blueprint` Adapter as a {@link PickerSource} for one setting: its
 * `search` told which `purpose` is asking, so one Adapter serves every
 * Blueprint picker in the panel. `undefined` without `search`.
 *
 * Called on the Adapter rather than plucked off it: a Consumer may implement
 * `search` as a method that needs its own `this`.
 */
export function useBlueprintSource(
	purpose: BlueprintPurpose,
): PickerSource | undefined {
	const blueprint = useFieldKit().adapters.blueprint;
	if (!blueprint?.search) return undefined;
	return {
		search: async (query) =>
			(await blueprint.search?.({ ...query, purpose })) ?? { items: [] },
		resolve: blueprint.resolve
			? async (query) => (await blueprint.resolve?.(query)) ?? []
			: undefined,
	};
}

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the Author reads. */
type ChoiceOption = BaseOption;

export interface BlueprintPickerProps {
	/** The Field being configured, so an Adapter failure names the Field it
	 * leaves harder to configure. */
	fieldId: string;
	/**
	 * The settings key this picker writes — `blueprints` for the reference
	 * types, `blueprint` for a Fieldset. Declared so the control honours
	 * `locked_settings` itself, in every state: a frozen setting must not
	 * become editable through a failed search or a missing source (ADR-0011).
	 */
	settingsKey: string;
	label: string;
	helperText: string;
	/** Several choices rather than one. */
	multiple?: boolean;
	/** The ids currently set. One-choice callers pass an array of zero or one,
	 * which is what keeps a single contract for both modes. */
	value: string[];
	onChange: (ids: string[]) => void;
	placeholder: string;
	/** Prefix of the test ids this control carries: the picker itself, its
	 * failure line (`-failed`, with `-retry`) and the no-source note
	 * (`-unavailable`). */
	testId: string;
	/** Where the choices come from — `useBlueprintSource(purpose)`, or the
	 * Text Type's. `undefined`: the application has no source. */
	source: PickerSource | undefined;
	/** What the Author reads when the search found nothing. */
	emptyMessage?: string;
	/** What a failed search says, in the menu and below the picker. Also the
	 * context of the console report when no `onError` is configured. */
	failureMessage?: string;
	/** What the setting says in place of an input when there is no source. */
	unavailableMessage?: string;
}

/** Appended to the name of a stored choice its source marks archived. */
const ARCHIVED_SUFFIX = " (archived)";

/**
 * Picks the Blueprint(s) — or Text Type Release — a setting names, searching
 * and paging through the Consumer's Adapter (ADR-0027).
 *
 * **This control owns no asynchrony.** Debounce, cancellation, the
 * stale-answer guard, paging and naming stored ids belong to anker's
 * `LookupSelect` (anker ADR-0002), as for the Reference value picker beside it
 * (ADR-0016). What is left here: reporting a failure on the Consumer's channel
 * and keeping it on screen with a retry, marking archived choices, the
 * no-source state, and the lock.
 *
 * There is no id text box in any state. A setting without a source says so; a
 * search that failed says so and offers a retry — neither turns into free
 * text, because an id nobody can look up is not a configuration an Author can
 * check.
 */
export function BlueprintPicker({
	fieldId,
	settingsKey,
	label,
	helperText,
	multiple = false,
	value,
	onChange,
	placeholder,
	testId,
	source,
	emptyMessage = "No blueprint matches",
	failureMessage = "Blueprint search failed",
	unavailableMessage = "This application has no source for blueprints.",
}: BlueprintPickerProps) {
	const lock = useSettingLock(settingsKey);
	const report = useAdapterErrorReporter(fieldId, failureMessage);
	const inputId = useId();
	const selectRef =
		useRef<SelectInstance<ChoiceOption, boolean, GroupBase<ChoiceOption>>>(
			null,
		);
	// Outlives the menu: the atom clears its own failure line the moment the
	// menu closes, and an Author who clicked away must still see that the
	// search failed and how to try again.
	const [failed, setFailed] = useState(false);

	const search = useCallback(
		async ({
			query,
			cursor,
			signal,
		}: LookupSearchArgs): Promise<LookupPage<ChoiceOption>> => {
			// Unreachable without a source — nothing renders the select then —
			// but the callback is built unconditionally, as hooks must be.
			if (!source) return { items: [] };
			try {
				const page = await source.search({ query, cursor, signal });
				if (!signal.aborted) setFailed(false);
				return {
					items: page.items.map((item) => ({ id: item.id, label: item.name })),
					nextCursor: page.nextCursor ?? null,
				};
			} catch (error) {
				// A superseded request is not a failure anyone can act on: the atom
				// has already moved on to the one that replaced it.
				if (!signal.aborted) {
					report(error);
					setFailed(true);
				}
				// Re-thrown so the atom shows its failure line in the open menu.
				throw error;
			}
		},
		[source, report],
	);

	const resolve = useCallback(
		async ({ ids, signal }: LookupResolveArgs): Promise<ChoiceOption[]> => {
			if (!source?.resolve) return [];
			try {
				return (await source.resolve({ ids, signal })).map((item) => ({
					id: item.id,
					label: item.archived ? `${item.name}${ARCHIVED_SUFFIX}` : item.name,
				}));
			} catch (error) {
				// A StrictMode double-invoke aborts the first pass; without this
				// guard one failure reports twice for one visible attempt. The atom
				// keeps the raw id on screen either way.
				if (!signal.aborted) report(error);
				throw error;
			}
		},
		[source, report],
	);

	function retry() {
		setFailed(false);
		// Opening the menu is what asks the source again — the atom searches on
		// every open — so a retry is exactly what the Author would do by hand.
		selectRef.current?.focus();
		selectRef.current?.openMenu("first");
	}

	return (
		<Box>
			{/* The helper sits outside the label on purpose: a <label> wraps its
			    descendants into the control's accessible name (see
			    list-settings.tsx). `htmlFor` rather than wrapping, because a
			    <label> around react-select's composite would name the widget
			    from everything inside it. */}
			<chakra.label
				htmlFor={source ? inputId : undefined}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				{label}
			</chakra.label>

			{source ? (
				<Box data-testid={testId}>
					<LookupSelect<ChoiceOption>
						ref={selectRef}
						inputId={inputId}
						// The panel's other controls are small; one setting must not
						// change size with the Adapter.
						size="sm"
						isMulti={multiple}
						value={multiple ? value : (value[0] ?? null)}
						search={search}
						// Presence is what the atom reads: without a resolver a stored
						// id shows as itself, which is the documented degrade.
						resolve={source.resolve ? resolve : undefined}
						disabled={lock.locked}
						onChange={(next) => {
							const picked = Array.isArray(next) ? next : next ? [next] : [];
							onChange(picked.map((option) => option.id));
						}}
						placeholder={placeholder}
						emptyMessage={emptyMessage}
						errorMessage={failureMessage}
					/>
				</Box>
			) : (
				<Box data-testid={`${testId}-unavailable`}>
					<Text fontSize="sm" color="fg.muted">
						{unavailableMessage}
					</Text>
					{/* What is stored stays readable — never dropped, never editable
					    here (ADR-0027). */}
					{value.length > 0 && (
						<Text fontSize="sm" mt="1">
							{value.join(", ")}
						</Text>
					)}
				</Box>
			)}

			{source && failed && (
				<HStack data-testid={`${testId}-failed`} role="alert" gap="2" mt="1">
					<Text fontSize="xs" color="fg.error">
						{failureMessage}
					</Text>
					<Button
						size="2xs"
						variant="outline"
						onClick={retry}
						disabled={lock.locked}
						data-testid={`${testId}-retry`}
					>
						Retry
					</Button>
				</HStack>
			)}

			<Text fontSize="xs" color="fg.muted" mt="1" mb={lock.locked ? "1" : "3"}>
				{helperText}
			</Text>
			<SettingLockReason lock={lock} />
		</Box>
	);
}
BlueprintPicker.displayName = "BlueprintPicker";
