import { Box } from "@chakra-ui/react";
import { DirtyDot } from "@knkcs/anker/atoms";
import { Tabs } from "@knkcs/anker/primitives";
import { useEffect, useMemo, useState } from "react";
import type { SpecPartition, SpecTab } from "../../schema/partition";
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { SpecFormSkeleton } from "./spec-form-skeleton";
import { useContainerOrientation } from "./use-container-orientation";
import { useTabIndicators } from "./use-tab-indicators";

function tabKey(tab: SpecTab, index: number): string {
	return tab.section?.config.api_accessor ?? `implicit-${index}`;
}

export interface SpecFormLabels {
	defaultTab?: string;
	searchPlaceholder?: string;
	noResults?: string;
}

export interface SpecFormProps {
	schema: Schema;
	mode?: "edit" | "read";
	readOnly?: boolean;
	loading?: boolean;
	/** Read-mode data source (Task 11); ignored in edit mode. */
	values?: Record<string, unknown>;
	labels?: SpecFormLabels;
}

export const DEFAULT_LABELS: Required<SpecFormLabels> = {
	defaultTab: "General",
	searchPlaceholder: "Find field…",
	noResults: "No fields found",
};

interface SpecFormTabsProps {
	partition: SpecPartition;
	readOnly?: boolean;
	labels: Required<SpecFormLabels>;
}

function SpecFormTabs({ partition, readOnly, labels }: SpecFormTabsProps) {
	const [activeTab, setActiveTab] = useState("tab-0");
	const { orientation, containerRef } = useContainerOrientation(
		partition.orientation,
	);
	const indicators = useTabIndicators(partition.tabs);

	// Reset to the first tab when the partition identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: partition is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [partition]);

	return (
		<Box ref={containerRef}>
			<Tabs.Root
				value={activeTab}
				onValueChange={(e) => setActiveTab(e.value)}
				orientation={orientation}
				// NEVER pass lazyMount/unmountOnExit: RHF needs all panels in the DOM.
			>
				<Tabs.List>
					{partition.tabs.map((tab, i) => (
						<Tabs.Trigger key={tabKey(tab, i)} value={`tab-${i}`}>
							{tab.section?.config.name ?? labels.defaultTab}
							{indicators[i].errorCount > 0 ? (
								<Box
									as="span"
									data-testid={`tab-errors-${i}`}
									bg="danger.600"
									color="white"
									borderRadius="full"
									fontSize="xs"
									px="1.5"
									ml="1.5"
								>
									{indicators[i].errorCount}
								</Box>
							) : (
								indicators[i].dirty && (
									<Box as="span" data-testid={`tab-dirty-${i}`} ml="1.5">
										<DirtyDot />
									</Box>
								)
							)}
						</Tabs.Trigger>
					))}
				</Tabs.List>
				{partition.tabs.map((tab, i) => (
					<Tabs.Content key={tabKey(tab, i)} value={`tab-${i}`}>
						<Box pt="4">
							<FieldRenderer schema={tab.fields} readOnly={readOnly} />
						</Box>
					</Tabs.Content>
				))}
			</Tabs.Root>
		</Box>
	);
}
SpecFormTabs.displayName = "SpecFormTabs";

export function SpecForm({
	schema,
	mode: _mode = "edit",
	readOnly,
	loading,
	values: _values,
	labels,
}: SpecFormProps) {
	const resolvedLabels = { ...DEFAULT_LABELS, ...labels };
	const partition = useMemo(() => partitionSchemaBySections(schema), [schema]);

	if (partition.tabs.length === 0) return null;

	if (loading) {
		return (
			<SpecFormSkeleton
				fieldCount={schema.length}
				showTabStrip={partition.hasSections}
			/>
		);
	}

	if (!partition.hasSections) {
		return (
			<FieldRenderer schema={partition.tabs[0].fields} readOnly={readOnly} />
		);
	}

	return (
		<SpecFormTabs
			partition={partition}
			readOnly={readOnly}
			labels={resolvedLabels}
		/>
	);
}
SpecForm.displayName = "SpecForm";
