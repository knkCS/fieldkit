// src/editor/type-picker.tsx

import {
	Box,
	chakra,
	Grid,
	Input,
	InputGroup,
	Stack,
	Text,
} from "@chakra-ui/react";
import { Tooltip } from "@knkcs/anker/primitives";
import { Search } from "lucide-react";
import { useContext, useMemo, useState } from "react";
import type { FieldKitAdapters } from "../renderer/adapters";
import { FieldKitContext } from "../renderer/context";
import { mergeLabels } from "../renderer/merge-labels";
import { servedByAdapters } from "../schema/adapter-capabilities";
import type {
	Consumer,
	FieldTypeCategory,
	FieldTypePlugin,
	Position,
} from "../schema/plugin";
import { allowedInPosition, offeredToConsumer } from "../schema/positions";
import type { Field } from "../schema/types";

export interface TypePickerLabels {
	searchPlaceholder?: string;
	searchLabel?: string;
	noMatches?: string;
	/** Tooltip/title on disabled at-max cards; "{max}" interpolated. */
	maxReached?: string;
	categories?: Partial<Record<FieldTypeCategory, string>>;
}

export const DEFAULT_TYPE_PICKER_LABELS: Required<TypePickerLabels> = {
	searchPlaceholder: "Search field types...",
	searchLabel: "Search field types",
	noMatches: "No matching field types",
	maxReached: "Limit reached (max {max})",
	categories: {
		text: "Text",
		number: "Number",
		date: "Date",
		selection: "Selection",
		boolean: "Boolean",
		structural: "Structural",
		reference: "Reference",
		media: "Media",
	},
};

/** Outside any `FieldKitProvider` there are no Adapters, so nothing that needs
 * one is offered. */
const NO_ADAPTERS: FieldKitAdapters = {};

export interface TypePickerProps {
	plugins: FieldTypePlugin[];
	/** Offers only the types this Consumer's picker lists (ADR-0022). Advice:
	 * nothing validates it. */
	consumer?: Consumer;
	/** Offers only the types a Field may be in this Position — `row` for a
	 * Row Spec, `reference_spec` for a Reference Spec (ADR-0022). The
	 * validator enforces the same rule, so the picker never offers a type
	 * `validateSpec()` would then refuse. */
	position?: Position;
	currentSpec?: Field[];
	onSelect: (pluginId: string) => void;
	labels?: TypePickerLabels;
	/** The Adapters whose capabilities decide which types are offered
	 * (ADR-0027). Absent: the enclosing `FieldKitProvider`'s, and none outside
	 * one. For a picker rendered on its own, away from the provider. */
	adapters?: FieldKitAdapters;
}

function countByType(spec: Field[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const field of spec) {
		counts.set(field.field_type, (counts.get(field.field_type) ?? 0) + 1);
	}
	return counts;
}

function TypePickerInner({
	plugins,
	consumer,
	position,
	currentSpec,
	onSelect,
	labels,
	adapters: adaptersProp,
}: TypePickerProps) {
	const [search, setSearch] = useState("");
	const provided = useContext(FieldKitContext)?.adapters;
	const adapters = adaptersProp ?? provided ?? NO_ADAPTERS;

	const filteredPlugins = useMemo(() => {
		let result = plugins.filter((p) => servedByAdapters(p, adapters));

		if (consumer) {
			result = result.filter((p) => offeredToConsumer(p, consumer));
		}
		if (position) {
			result = result.filter((p) => allowedInPosition(p, position));
		}

		if (search.trim()) {
			const term = search.trim().toLowerCase();
			result = result.filter(
				(p) =>
					p.name.toLowerCase().includes(term) ||
					p.description.toLowerCase().includes(term),
			);
		}

		return result;
	}, [plugins, adapters, consumer, position, search]);

	const typeCounts = useMemo(
		() => (currentSpec ? countByType(currentSpec) : new Map<string, number>()),
		[currentSpec],
	);

	const grouped = useMemo(() => {
		const groups = new Map<string, FieldTypePlugin[]>();
		for (const plugin of filteredPlugins) {
			const cat = plugin.category;
			if (!groups.has(cat)) {
				groups.set(cat, []);
			}
			groups.get(cat)?.push(plugin);
		}
		return groups;
	}, [filteredPlugins]);

	// mergeLabels (rather than a blind `{...DEFAULT, ...labels}` spread)
	// because a caller that builds its labels object by mapping through
	// possibly-absent upstream fields (as TypePickerPopover's `pickerLabels`
	// does when threaded from a CanvasLabels that doesn't set the type* keys)
	// produces keys present with value `undefined`, not omitted — a spread
	// would still overwrite the default with that `undefined`.
	const l = {
		...mergeLabels(DEFAULT_TYPE_PICKER_LABELS, labels),
		categories: {
			...DEFAULT_TYPE_PICKER_LABELS.categories,
			...labels?.categories,
		},
	};

	return (
		<Stack gap="3" data-testid="type-picker">
			<InputGroup startElement={<Search size={16} />}>
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={l.searchPlaceholder}
					aria-label={l.searchLabel}
					size="sm"
				/>
			</InputGroup>

			{Array.from(grouped.entries()).map(([category, categoryPlugins]) => (
				<Box key={category}>
					<Text
						fontSize="xs"
						fontWeight="semibold"
						textTransform="uppercase"
						letterSpacing="wider"
						color="fg.muted"
						mb="2"
					>
						{l.categories[category as FieldTypeCategory] ?? category}
					</Text>
					<Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap="2">
						{categoryPlugins.map((plugin) => {
							const count = typeCounts.get(plugin.id) ?? 0;
							const isAtMax =
								plugin.maxPerSpec !== undefined && count >= plugin.maxPerSpec;
							const Icon = plugin.icon;
							const maxTitle = l.maxReached.replace(
								"{max}",
								String(plugin.maxPerSpec ?? 0),
							);
							const card = (
								<chakra.button
									key={plugin.id}
									type="button"
									data-testid={`type-option-${plugin.id}`}
									disabled={isAtMax}
									title={isAtMax ? maxTitle : undefined}
									onClick={() => onSelect(plugin.id)}
									display="flex"
									alignItems="flex-start"
									gap="2"
									p="2.5"
									borderWidth="1px"
									borderColor="border"
									borderRadius="md"
									bg={isAtMax ? "bg-subtle" : "bg-surface"}
									opacity={isAtMax ? 0.5 : 1}
									cursor={isAtMax ? "not-allowed" : "pointer"}
									textAlign="left"
									width="100%"
									_hover={isAtMax ? undefined : { bg: "bg-muted" }}
									_focusVisible={{
										outline: "2px solid",
										outlineColor: "accent",
										outlineOffset: "1px",
									}}
								>
									<Box as="span" flexShrink={0} mt="0.5">
										<Icon size={18} />
									</Box>
									<Stack gap="0.5">
										<Text fontWeight="medium" fontSize="sm">
											{plugin.name}
										</Text>
										<Text fontSize="xs" color="fg.muted">
											{plugin.description}
										</Text>
									</Stack>
								</chakra.button>
							);
							return isAtMax ? (
								<Tooltip key={plugin.id} content={maxTitle}>
									{card}
								</Tooltip>
							) : (
								card
							);
						})}
					</Grid>
				</Box>
			))}

			{grouped.size === 0 && (
				<Text color="fg.subtle" textAlign="center" p="4">
					{l.noMatches}
				</Text>
			)}
		</Stack>
	);
}

/**
 * The field-type picker. Offers only the Field Types the Consumer can serve
 * (ADR-0027, amended): a type whose `requiresAdapters` the Adapters do not
 * meet is hidden — `reference` and `single_reference` without a Blueprint
 * search serving `reference_target`, `fieldset` without one serving
 * `fieldset`, `rich_text` without `textType.search`. The Adapters are
 * the provider's unless `adapters` says otherwise, so every picker in the
 * editor — the canvas's, a Row Spec's, a Reference Spec's — hides the same
 * types. Hiding narrows the picker only; a stored Field of such a type stays
 * valid, and its setting says the application has no source for it.
 */
export const TypePicker = TypePickerInner;
(TypePicker as { displayName?: string }).displayName = "TypePicker";
