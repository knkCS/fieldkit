import { Stack, Text } from "@chakra-ui/react";
import { DrawerRoot } from "@knkcs/anker/components";
import { declaredAttributes } from "../../schema/reference-attributes";
import { referenceRowPath } from "../../schema/reference-tree";
import type { Field } from "../../schema/types";
import { NestedItemFields } from "./item-fields";

export interface ReferenceAttributesDrawerProps {
	open: boolean;
	onClose: () => void;
	/** The Attribute Spec this Field declares. */
	spec: Field[];
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
 * The Attributes of one Reference, in a drawer.
 *
 * Nothing here knows what an Attribute *is*. The Spec is rendered by fieldkit's
 * own renderer under the Reference's path in the form the Consumer owns, so
 * every Attribute brings its own control, its own Zod type and its own error
 * for free — a number Attribute is a number input because the `number` plugin
 * says so, not because this drawer has a case for it.
 *
 * The path is the whole trick: `related.1.children.0.attributes.page` addresses
 * a value inside the Reference Tree, so an Attribute is stored *on its
 * Reference* rather than in a parallel structure that reordering would have to
 * keep in step. Moving a Reference moves its whole entry, Attributes included,
 * and nothing here has to know that happened.
 *
 * A drawer rather than an inline expansion because a row is a row: an Attribute
 * Spec can be several Fields deep, and unfolding that into a tree an Author is
 * dragging would bury the tree.
 */
export function ReferenceAttributesDrawer({
	open,
	onClose,
	spec,
	accessor,
	path,
	name,
	readOnly,
}: ReferenceAttributesDrawerProps) {
	const attributes = declaredAttributes(spec);
	const prefix = `${accessor}.${referenceRowPath(path)}.attributes`;

	return (
		<DrawerRoot open={open} onClose={onClose} title={name} closeLabel="Done">
			<Stack gap="4" data-testid="reference-attributes-drawer">
				{attributes.length === 0 ? (
					<Text fontSize="sm" color="fg.muted">
						This field declares no attributes.
					</Text>
				) : (
					<NestedItemFields
						childFields={attributes}
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
ReferenceAttributesDrawer.displayName = "ReferenceAttributesDrawer";
