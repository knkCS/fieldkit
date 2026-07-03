import { Box } from "@chakra-ui/react";
import { Tabs } from "@knkcs/anker/primitives";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SpecTab } from "../../schema/partition";
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { SpecFormSkeleton } from "./spec-form-skeleton";
import { useContainerOrientation } from "./use-container-orientation";

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
	const [activeTab, setActiveTab] = useState("tab-0");
	const containerRef = useRef<HTMLDivElement>(null);
	const orientation = useContainerOrientation(
		containerRef,
		partition.orientation,
	);

	// Reset to the first tab when the schema identity changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: schema is a reset trigger, not read in the effect body
	useEffect(() => {
		setActiveTab("tab-0");
	}, [schema]);

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
							{tab.section?.config.name ?? resolvedLabels.defaultTab}
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
SpecForm.displayName = "SpecForm";
