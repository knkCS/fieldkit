import { Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { FieldProps } from "../../schema/plugin";
import type { Reference } from "../../schema/reference";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { useResolvedContentName } from "../hooks/use-resolved-content-name";
import { useFieldKit } from "../provider";

/** react-select's option shape (anker's `BaseOption`): `id` is the value,
 * `label` is what the person filling in the form reads. */
interface ContentOption {
	id: string;
	label: string;
}

/**
 * Exactly one Reference, picked from the Contents the reference Adapter
 * offers.
 *
 * Two things this control deliberately does not do:
 *
 * - **It never stores a name.** `onChange` writes `{ id }` and nothing else;
 *   the name on screen is resolved through the Adapter on every load, so a
 *   Content renamed elsewhere reads correctly here.
 * - **It never re-filters the Adapter's results** (`filterOption={null}`).
 *   The Adapter decides what matches a query; fieldkit knows nothing about
 *   Content beyond an id and a display name (ADR-0002).
 */
export function SingleReferenceField({
	field,
	readOnly,
}: FieldProps<SingleReferenceSettings>) {
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const adapter = adapters.reference;

	// Serialized, not the array itself: a Consumer's settings object is a
	// fresh literal on every render, and effect deps must not churn with it.
	const blueprintsKey = JSON.stringify(settings?.blueprints ?? []);
	const blueprints = useMemo(
		() => JSON.parse(blueprintsKey) as string[],
		[blueprintsKey],
	);

	const value = useWatch({ name: accessor }) as Reference | null | undefined;
	const selectedId = value?.id ?? null;

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
			.search(blueprints, query)
			.then((items) => {
				if (cancelled) return;
				setOptions(
					items.map((item) => ({ id: item.id, label: item.display_name })),
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
	}, [adapter, blueprints, query, menuOpen, report]);

	const selected: ContentOption | null = selectedId
		? {
				id: selectedId,
				label:
					resolvedName ??
					(picked?.id === selectedId ? picked.label : null) ??
					selectedId,
			}
		: null;

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
				<BaseSelect<ContentOption>
					// Matches the `htmlFor` anker's FormField puts on the label, so
					// the label names react-select's input.
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
						// One Reference or none — never an array, and never a name.
						formField.onChange(option ? { id: option.id } : null);
						setPicked(option ?? null);
					}}
					placeholder="Search content..."
					noOptionsMessage={({ inputValue }) =>
						inputValue ? "No content matches" : "No content available"
					}
				/>
			)}
		</FormField>
	);
}
SingleReferenceField.displayName = "SingleReferenceField";
