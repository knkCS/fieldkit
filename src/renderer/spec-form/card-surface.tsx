// src/renderer/spec-form/card-surface.tsx
import { Box, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

/**
 * The visual card frame shared by SpecForm's edit mode, read mode, and the
 * loading skeleton (and reused by the editor canvas for its implicit-group
 * degrade). Semantic tokens only: elevated surface, border, subtle shadow.
 * `title` renders as a small heading when non-empty; an untitled card is a
 * plain frame with no header (card-layout Decision 3).
 */
export function CardSurface({
	title,
	children,
}: {
	title?: string;
	children: ReactNode;
}) {
	return (
		<Box
			bg="bg-surface"
			borderWidth="1px"
			borderColor="border"
			borderRadius="lg"
			boxShadow="sm"
			p="5"
			data-testid="card-surface"
		>
			{title ? (
				<Text as="h3" fontSize="sm" fontWeight="semibold" mb="4">
					{title}
				</Text>
			) : null}
			{children}
		</Box>
	);
}
CardSurface.displayName = "CardSurface";
