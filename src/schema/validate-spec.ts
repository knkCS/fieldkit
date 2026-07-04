import type { FieldTypePlugin } from "./plugin";
import type { Field } from "./types";

export type SpecFieldErrorCode =
	| "duplicate_accessor"
	| "empty_name"
	| "empty_accessor";

export interface SpecFieldError {
	accessor: string;
	code: SpecFieldErrorCode;
	message: string;
}

export interface SpecValidationResult {
	valid: boolean;
	errors: string[];
	fieldErrors: SpecFieldError[];
}

export function validateSpec(
	fields: Field[],
	plugins: Map<string, FieldTypePlugin>,
): SpecValidationResult {
	const errors: string[] = [];
	const fieldErrors: SpecFieldError[] = [];

	// Count fields per type
	const typeCounts = new Map<string, number>();
	for (const field of fields) {
		typeCounts.set(
			field.field_type,
			(typeCounts.get(field.field_type) ?? 0) + 1,
		);
	}

	// Check maxPerSpec constraints
	for (const [typeId, count] of typeCounts) {
		const plugin = plugins.get(typeId);
		if (plugin?.maxPerSpec != null && count > plugin.maxPerSpec) {
			errors.push(
				`Field type "${plugin.name}" (${typeId}) is limited to ${plugin.maxPerSpec} per spec, but ${count} were found`,
			);
		}
	}

	// Check accessor constraints: empty name, empty accessor, duplicates
	const seen = new Map<string, number>();
	for (const field of fields) {
		const accessor = field.config.api_accessor;
		if (!field.config.name.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_name",
				message: "Name must not be empty",
			});
		}
		if (!accessor.trim()) {
			fieldErrors.push({
				accessor,
				code: "empty_accessor",
				message: "Accessor must not be empty",
			});
		} else {
			seen.set(accessor, (seen.get(accessor) ?? 0) + 1);
		}
	}
	for (const [accessor, count] of seen) {
		if (count > 1) {
			fieldErrors.push({
				accessor,
				code: "duplicate_accessor",
				message: `Duplicate accessor "${accessor}"`,
			});
		}
	}
	for (const fe of fieldErrors) {
		errors.push(fe.message);
	}

	return { valid: errors.length === 0, errors, fieldErrors };
}
