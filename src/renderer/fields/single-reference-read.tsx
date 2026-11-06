// src/renderer/fields/single-reference-read.tsx
import type { SingleReferenceSettings } from "../../schema/field-types/single-reference";
import type { ReadProps } from "../../schema/plugin";
import { asReference } from "../../schema/reference";
import { useResolvedContentName } from "../hooks/use-resolved-content-name";
import { EmptyReadValue } from "./empty-value";
import {
	ReferenceName,
	referenceHref,
	useReferenceHrefFor,
} from "./reference-name";

/**
 * A Single Reference in read mode: the referenced Content's *current* name,
 * resolved through the Adapter, falling back to its id when it cannot be
 * resolved so the Reference is visible rather than gone.
 *
 * This is why the type's cell is bypassed. A cell has neither Adapter access
 * nor async, so it counts (`1 reference`) exactly as the tree Reference
 * Field's cell does; read mode sits inside the renderer, reaches the adapter,
 * and can say which Content it is (ADR-0008).
 */
export function SingleReferenceReadValue({
	field,
	value,
}: ReadProps<SingleReferenceSettings>) {
	const reference = asReference(value);
	const hrefFor = useReferenceHrefFor();
	const name = useResolvedContentName(
		reference?.id ?? null,
		field.config.api_accessor,
	);
	if (!reference) return <EmptyReadValue />;
	return (
		<ReferenceName
			name={name ?? reference.id}
			href={referenceHref(hrefFor, reference.id)}
		/>
	);
}
SingleReferenceReadValue.displayName = "SingleReferenceReadValue";
