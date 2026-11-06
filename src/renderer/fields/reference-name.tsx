// src/renderer/fields/reference-name.tsx
import { Link, Text, type TextProps } from "@chakra-ui/react";
import type { FieldKitAdapters } from "../adapters";
import { useFieldKit } from "../provider";

/** The reference Adapter's optional address hook (ADR-0031). */
export type ReferenceHrefFor = NonNullable<
	FieldKitAdapters["reference"]
>["hrefFor"];

/**
 * The address `hrefFor` answers for one Content, or `null`: when there is no
 * id, no `hrefFor`, or it answers nothing — an empty string included, which no
 * link could honestly point at.
 */
export function referenceHref(
	hrefFor: ReferenceHrefFor,
	id: string | null | undefined,
): string | null {
	if (!id || !hrefFor) return null;
	return hrefFor(id) || null;
}

/** The provider's reference Adapter's `hrefFor`, for a component that renders
 * inside `FieldKitProvider`. */
export function useReferenceHrefFor(): ReferenceHrefFor {
	return useFieldKit().adapters.reference?.hrefFor;
}

interface ReferenceNameProps extends Omit<TextProps, "children"> {
	/** What the Reference shows: the resolved name, or the id in its place. */
	name: string;
	/** Its Content's address, where the Adapter answered one. */
	href: string | null;
}

/**
 * A Reference's name: a link where the Adapter answered an address for it,
 * plain text — exactly as before — where it did not.
 *
 * One component for every place a Reference is named (the read-mode tree, the
 * form's Reference Tree, Single Reference), so what the link looks like is
 * written once. A real `<a href>`, never a click handler: it opens in a new
 * tab, can be copied and is announced as a link, and a Consumer that
 * intercepts navigation does it in its router.
 */
export function ReferenceName({
	name,
	href,
	...textProps
}: ReferenceNameProps) {
	if (!href) return <Text {...textProps}>{name}</Text>;
	return (
		<Text {...textProps}>
			<Link href={href} variant="underline">
				{name}
			</Link>
		</Text>
	);
}
ReferenceName.displayName = "ReferenceName";
