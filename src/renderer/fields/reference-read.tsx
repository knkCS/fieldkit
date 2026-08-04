// src/renderer/fields/reference-read.tsx
import { Box, Text } from "@chakra-ui/react";
import { useMemo } from "react";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { ReadProps } from "../../schema/plugin";
import { declaredAttributes } from "../../schema/reference-attributes";
import { readReferenceTree } from "../../schema/reference-tree";
import { useResolvedContentNames } from "../hooks/use-resolved-content-names";
import { EmptyReadValue } from "./empty-value";
import { INDENT_WIDTH } from "./reference-tree";

/**
 * A Reference Tree in read mode: the same structure editing shows, resolved
 * and static.
 *
 * It bypasses `ReferenceCell` for the reason ADR-0008 gives. A cell has
 * neither Adapter access nor async, so a count is the honest answer at table
 * density — the alternative is a row of raw ids. Read mode sits inside the
 * renderer, reaches the adapter, and so can show what the tree actually holds:
 * every Content's current name, at the depth it sits at, with the Attribute
 * values that belong to it.
 *
 * Three things it deliberately does not do:
 *
 * - **It never touches react-hook-form.** Read mode renders without a
 *   `FormProvider` in the tree, so the value arrives as a prop and the
 *   Attributes are rendered from the record rather than registered as paths —
 *   which is what separates this from the Attributes drawer.
 * - **It never folds.** Collapsing exists in the editing control because a
 *   tall tree is hard to *drag* through; there is nothing to drag here, and a
 *   branch an Author has to expand before they can read it is a branch read
 *   mode hid for no reason.
 * - **It never stores or trusts a name.** Names are resolved on every load, and
 *   a Content that no longer resolves keeps its id on screen (ADR-0008).
 *
 * The indentation is the editing control's, imported rather than restated:
 * "reading conveys the same structure as editing" is only true if the two draw
 * a level at the same width.
 */
export function ReferenceReadValue({
	field,
	value,
	renderChild,
}: ReadProps<ReferenceSettings>) {
	// Read rather than cast: form data arrives from a Consumer and is only as
	// well-formed as whatever produced it. Anything that is not a Reference
	// yields no row, at any level.
	const rows = useMemo(() => readReferenceTree(value), [value]);

	const names = useResolvedContentNames(
		rows.map((row) => row.reference.id),
		field.config.api_accessor,
	);

	// The Attributes someone filling in the form was actually asked for — the
	// same skip the drawer and the row count make, so a read-mode row cannot
	// show an Attribute no drawer offers.
	const attributes = useMemo(
		() => declaredAttributes(field.settings?.attributes ?? []),
		[field.settings?.attributes],
	);

	if (rows.length === 0) return <EmptyReadValue />;

	return (
		// Spans throughout, and label/value pairs written out rather than an
		// anker `DescriptionList`: read mode renders every value inside a
		// `DescriptionList.Row`, which is a `<p>`, and a `<div>` anywhere under
		// one is invalid HTML. `DescriptionList` is div-based, so nesting one
		// here would put divs inside that `<p>`.
		<Box
			as="span"
			display="flex"
			flexDirection="column"
			gap="2"
			// anker's horizontal `DescriptionList.Row` right-aligns its value, and
			// that inherits. Left-aligned here or the indentation would be
			// invisible: every name would end at the same right edge whatever
			// depth it sits at, and depth is the thing this rendering exists to
			// show.
			textAlign="start"
			data-testid="reference-read-tree"
		>
			{rows.map((row) => (
				<Box
					key={row.key}
					as="span"
					display="block"
					ml={`${String(row.depth * INDENT_WIDTH)}px`}
					borderLeftWidth="2px"
					borderColor="border"
					pl="3"
					data-testid="reference-read-row"
					// The row's depth, for a test to read and for a Consumer to
					// style against without measuring pixels — the same attribute
					// the editing control puts on its rows.
					data-depth={row.depth}
				>
					<Text as="span" display="block" data-testid="reference-read-name">
						{names[row.reference.id] ?? row.reference.id}
					</Text>
					{attributes.map((attribute) => (
						<Box
							key={attribute.config.api_accessor}
							as="span"
							display="flex"
							gap="2"
							alignItems="baseline"
							data-testid="reference-read-attribute"
						>
							<Text as="span" fontSize="sm" color="fg.muted" flexShrink={0}>
								{attribute.config.name}
							</Text>
							{/* An Attribute is an ordinary Field, so its value reads the
							    way any Field's value reads — a number Attribute through the
							    number plugin's cell, a boolean as Yes or No. Nothing here
							    has a case for either. */}
							<Box as="span" display="block" minWidth="0">
								{renderChild(
									attribute,
									row.reference.attributes?.[attribute.config.api_accessor],
								)}
							</Box>
						</Box>
					))}
				</Box>
			))}
		</Box>
	);
}
ReferenceReadValue.displayName = "ReferenceReadValue";
