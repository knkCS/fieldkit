import { Text } from "@chakra-ui/react";
import { BaseSelect } from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWatch } from "react-hook-form";
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { FieldProps } from "../../schema/plugin";
import type { Reference } from "../../schema/reference";
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
	const { adapters, onError } = useFieldKit();
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

	// The Consumer's own error channel, not the console: an Adapter failure is
	// theirs to surface, reported against the Field it degrades. Without a
	// configured `onError` it still reaches the console, so the degrade is
	// never silent.
	const report = useCallback(
		(error: unknown) => {
			const wrapped = error instanceof Error ? error : new Error(String(error));
			if (onError) onError(wrapped, accessor);
			else console.error("Reference adapter failed:", wrapped);
		},
		[onError, accessor],
	);

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
					// chakra-react-select otherwise reads `required` off the
					// surrounding Field and mounts a hidden required input, which
					// makes the browser block submit before React Hook Form ever
					// validates. The generated Schema is the one source of truth
					// for whether this Field may be empty, exactly as it is for
					// every other field type.
					required={false}
					options={options}
					value={selected}
					// BaseSelect has no read-only mode of its own — a composite
					// widget cannot be typed into and left focusable in a useful
					// way — so read mode disables it.
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
