import { Skeleton, Stack } from "@chakra-ui/react";
import { CardSurface } from "./card-surface";

const MAX_SKELETON_ROWS = 8;

function SkeletonRows({
	count,
	keyPrefix,
}: {
	count: number;
	keyPrefix: string;
}) {
	return (
		<>
			{Array.from({ length: count }, (_, i) => (
				<Stack key={`${keyPrefix}-${i as number}`} gap="1.5">
					<Skeleton height="4" width="30%" />
					<Skeleton height="9" />
				</Stack>
			))}
		</>
	);
}
SkeletonRows.displayName = "SkeletonRows";

export function SpecFormSkeleton({
	fieldCount,
	showTabStrip,
	cardSizes,
}: {
	fieldCount: number;
	showTabStrip: boolean;
	/** Per-card field counts of the first tab when it has card markers —
	 * the skeleton then draws its rows INSIDE card frames. Omitted or
	 * empty → the flat row list. */
	cardSizes?: number[];
}) {
	if (cardSizes && cardSizes.length > 0) {
		// Cap the TOTAL row count like the flat variant, but keep at least one
		// row per frame so an empty card still reads as a card.
		let remaining = MAX_SKELETON_ROWS;
		return (
			<Stack gap="5" data-testid="spec-form-skeleton">
				{showTabStrip && <Skeleton height="8" width="60%" />}
				{cardSizes.map((size, i) => {
					const rows = Math.max(1, Math.min(size, remaining));
					remaining = Math.max(1, remaining - rows);
					return (
						<CardSurface key={`skeleton-card-${i as number}`}>
							<Stack gap="5">
								<SkeletonRows
									count={rows}
									keyPrefix={`skeleton-card-${i}-row`}
								/>
							</Stack>
						</CardSurface>
					);
				})}
			</Stack>
		);
	}

	const rows = Math.max(1, Math.min(fieldCount, MAX_SKELETON_ROWS));
	return (
		<Stack gap="5" data-testid="spec-form-skeleton">
			{showTabStrip && <Skeleton height="8" width="60%" />}
			<SkeletonRows count={rows} keyPrefix="skeleton-row" />
		</Stack>
	);
}
SpecFormSkeleton.displayName = "SpecFormSkeleton";
