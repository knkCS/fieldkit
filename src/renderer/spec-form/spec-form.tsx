import { useMemo } from "react";
import { partitionSchemaBySections } from "../../schema/partition";
import type { Schema } from "../../schema/types";
import { FieldRenderer } from "../field-renderer";
import { SpecFormSkeleton } from "./spec-form-skeleton";

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
	labels: _labels,
}: SpecFormProps) {
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

	// Tabbed rendering added in Task 6.
	return <FieldRenderer schema={schema} readOnly={readOnly} />;
}
SpecForm.displayName = "SpecForm";
