import { Skeleton, Stack } from "@chakra-ui/react";

const MAX_SKELETON_ROWS = 8;

export function SpecFormSkeleton({
	fieldCount,
	showTabStrip,
}: {
	fieldCount: number;
	showTabStrip: boolean;
}) {
	const rows = Math.max(1, Math.min(fieldCount, MAX_SKELETON_ROWS));
	return (
		<Stack gap="5" data-testid="spec-form-skeleton">
			{showTabStrip && <Skeleton height="8" width="60%" />}
			{Array.from({ length: rows }, (_, i) => (
				<Stack key={`skeleton-row-${i as number}`} gap="1.5">
					<Skeleton height="4" width="30%" />
					<Skeleton height="9" />
				</Stack>
			))}
		</Stack>
	);
}
SpecFormSkeleton.displayName = "SpecFormSkeleton";
