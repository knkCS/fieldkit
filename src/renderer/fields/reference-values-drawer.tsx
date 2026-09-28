import { Stack, Text } from "@chakra-ui/react";
import { DrawerRoot } from "@knkcs/anker/components";
import { declaredReferenceFields } from "../../schema/reference-spec";
import { referenceRowPath } from "../../schema/reference-tree";
import type { Field } from "../../schema/types";
import { NestedItemFields } from "./item-fields";

export interface ReferenceValuesDrawerProps {
	open: boolean;
	onClose: () => void;
	/** The Reference Spec this Reference follows — the embedded one, or the
	 * one linked for its target's Blueprint. */
	referenceSpec: readonly Field[];
	/** The Reference Field's own Accessor. */
	accessor: string;
	/** Index path of the Reference being filled in — a row's `path`. */
	path: readonly number[];
	/** The resolved name of the Content the Reference points at, for the title:
	 * an Author filling in a page number needs to know whose page it is. */
	name: string;
	readOnly?: boolean;
}

/**
 * The values of one Reference, in a drawer.
 *
 * Nothing here knows what the Reference Spec's Fields *are*. The Spec is
 * rendered by fieldkit's own renderer under the Reference's path in the form
 * the Consumer owns, so every Field brings its own control, its own Zod type
 * and its own error for free — a number is a number input because the
 * `number` plugin says so, not because this drawer has a case for it.
 *
 * The path is the whole trick: `related.1.children.0.values.page` addresses a
 * value inside the Reference Tree, so a value is stored *on its Reference*
 * rather than in a parallel structure that reordering would have to keep in
 * step. Moving a Reference moves its whole entry, values included, and nothing
 * here has to know that happened.
 *
 * A drawer rather than an inline expansion because a row is a row: a Reference
 * Spec can be several Fields deep, and unfolding that into a tree an Author is
 * dragging would bury the tree.
 */
export function ReferenceValuesDrawer({
	open,
	onClose,
	referenceSpec,
	accessor,
	path,
	name,
	readOnly,
}: ReferenceValuesDrawerProps) {
	// Only what an Author is actually being asked for — the same skip the shared
	// builder makes, so the drawer and the row's count cannot disagree.
	const asked = declaredReferenceFields(referenceSpec);
	const prefix = `${accessor}.${referenceRowPath(path)}.values`;

	return (
		<DrawerRoot open={open} onClose={onClose} title={name} closeLabel="Done">
			<Stack gap="4" data-testid="reference-values-drawer">
				{asked.length === 0 ? (
					<Text fontSize="sm" color="fg.muted">
						This reference carries no values.
					</Text>
				) : (
					<NestedItemFields
						childFields={asked}
						// No `index`: the record is nested directly under this
						// Reference's own path, the way a Fieldset's one record is —
						// there is nothing repeating here to number.
						parentAccessor={prefix}
						readOnly={readOnly}
					/>
				)}
			</Stack>
		</DrawerRoot>
	);
}
ReferenceValuesDrawer.displayName = "ReferenceValuesDrawer";
