import { Box } from "@chakra-ui/react";

export interface TabErrorBadgeProps {
	index: number;
	count: number;
}

/** Small numeric badge shown on a tab trigger when that tab has field
 * errors — shared by SpecFormTabs (renderer) and EditorCanvas (editor) so
 * the markup and styling can't drift between the two. */
export function TabErrorBadge({ index, count }: TabErrorBadgeProps) {
	return (
		<Box
			as="span"
			data-testid={`tab-errors-${index}`}
			bg="danger.600"
			color="fg.inverted"
			borderRadius="full"
			fontSize="xs"
			px="1.5"
			ml="1.5"
		>
			{count}
		</Box>
	);
}
TabErrorBadge.displayName = "TabErrorBadge";
