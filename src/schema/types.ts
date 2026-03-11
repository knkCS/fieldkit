// src/schema/types.ts

/** Condition for showing/hiding a field based on another field's value. */
export interface FieldCondition {
	/** api_accessor of the controlling field */
	field: string;
	operator: "eq" | "neq" | "in" | "not_in" | "exists";
	value: unknown;
}

/** Validation rules applied to a field's value. */
export interface FieldValidation {
	min_length?: number;
	max_length?: number;
	pattern?: string;
	pattern_message?: string;
}

/** Base configuration shared by all field types. */
export interface FieldConfig {
	name: string;
	api_accessor: string;
	required: boolean;
	instructions: string;
	default_value?: unknown;
	unique?: boolean;
	localizable?: boolean;
	hidden?: boolean;
	read_only?: boolean;
	condition?: FieldCondition;
}

/** A single field definition in a specification. */
export interface Field<T = unknown> {
	field_type: string;
	config: FieldConfig;
	validation?: FieldValidation;
	settings?: T | null;
	children?: Field[] | null;
	system: boolean;
}

/** A specification is an array of field definitions. */
export type Schema = Field[];
