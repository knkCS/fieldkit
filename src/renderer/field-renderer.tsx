// src/renderer/field-renderer.tsx
import { Stack } from "@chakra-ui/react";
import { memo } from "react";
import type { Schema } from "../schema/types";
import { FieldComponent } from "./field-component";

export interface FieldRendererProps {
	schema: Schema;
	readOnly?: boolean;
	loading?: boolean;
	values?: Record<string, unknown>;
}

function FieldRendererInner({ schema, readOnly, loading }: FieldRendererProps) {
	if (loading) {
		return <div data-testid="field-renderer-loading">Loading...</div>;
	}

	return (
		// gap="5" = 20px — the anker §10 vertical rhythm between field rows
		<Stack gap="5" data-testid="field-renderer">
			{schema.map((field) => (
				<FieldComponent
					key={field.config.api_accessor}
					field={field}
					readOnly={readOnly}
				/>
			))}
		</Stack>
	);
}

/**
 * A flat list of Fields over the Consumer's form. Unlike `SpecForm`, it does
 * not mint `_id`s into rows loaded without them (ADR-0023) — it also renders
 * a row's own Fields, where there is no whole value to normalise — so a
 * Consumer using it directly passes its values through `mintMissingIds()`
 * before handing them to the form.
 */
export const FieldRenderer = memo(FieldRendererInner);
(FieldRenderer as { displayName?: string }).displayName = "FieldRenderer";
