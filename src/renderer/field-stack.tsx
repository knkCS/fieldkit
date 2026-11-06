// src/renderer/field-stack.tsx
import { Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";

/**
 * The vertical rhythm between a Tab's Fields — the form's and read mode's
 * alike (ADR-0030). One place, so the two cannot drift apart again.
 */
export function FieldStack({
	children,
	"data-testid": testId,
}: {
	children: ReactNode;
	"data-testid"?: string;
}) {
	return (
		// gap="5" = 20px — the anker §10 vertical rhythm between field rows
		<Stack gap="5" data-testid={testId}>
			{children}
		</Stack>
	);
}
FieldStack.displayName = "FieldStack";
