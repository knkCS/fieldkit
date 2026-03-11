// src/schema/builders.ts
import type { Field, FieldConfig, FieldValidation } from "./types";

type BaseOptions = {
	name?: string;
	required?: boolean;
	instructions?: string;
	default_value?: unknown;
	unique?: boolean;
	localizable?: boolean;
	hidden?: boolean;
	read_only?: boolean;
	validation?: Partial<FieldValidation>;
};

const BASE_OPTION_KEYS = new Set([
	"name",
	"required",
	"instructions",
	"default_value",
	"unique",
	"localizable",
	"hidden",
	"read_only",
	"validation",
]);

function buildConfig(apiAccessor: string, options?: BaseOptions): FieldConfig {
	return {
		name: options?.name ?? apiAccessor,
		api_accessor: apiAccessor,
		required: options?.required ?? false,
		instructions: options?.instructions ?? "",
		default_value: options?.default_value,
		unique: options?.unique,
		localizable: options?.localizable,
		hidden: options?.hidden,
		read_only: options?.read_only,
	};
}

function extractSettings<S>(
	options: Record<string, unknown> | undefined,
	settingsKeys?: string[],
): S | null {
	if (!options) return null;

	const rest: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(options)) {
		if (!BASE_OPTION_KEYS.has(k)) {
			rest[k] = v;
		}
	}

	if (settingsKeys) {
		const picked: Record<string, unknown> = {};
		for (const k of settingsKeys) {
			if (k in rest) {
				picked[k] = rest[k];
			}
		}
		return Object.keys(picked).length > 0 ? (picked as S) : null;
	}

	return Object.keys(rest).length > 0 ? (rest as S) : null;
}

function buildField<S>(
	fieldType: string,
	apiAccessor: string,
	options?: BaseOptions & Record<string, unknown>,
	settingsKeys?: string[],
): Field<S> {
	const settings = extractSettings<S>(
		options as Record<string, unknown> | undefined,
		settingsKeys,
	);

	return {
		field_type: fieldType,
		config: buildConfig(apiAccessor, options),
		validation: options?.validation as FieldValidation | undefined,
		settings,
		children: null,
		system: false,
	};
}

export function text(
	apiAccessor: string,
	options?: BaseOptions & {
		placeholder?: string;
		prepend?: string;
		append?: string;
	},
) {
	return buildField<{
		placeholder?: string;
		prepend?: string;
		append?: string;
	}>("text", apiAccessor, options, ["placeholder", "prepend", "append"]);
}

export function number(
	apiAccessor: string,
	options?: BaseOptions & {
		min?: number;
		max?: number;
		step?: number;
		prepend?: string;
		append?: string;
	},
) {
	return buildField("number", apiAccessor, options, [
		"min",
		"max",
		"step",
		"prepend",
		"append",
	]);
}

export function boolean(apiAccessor: string, options?: BaseOptions) {
	return buildField("boolean", apiAccessor, options);
}

export function select(
	apiAccessor: string,
	options?: BaseOptions & {
		options?: Record<string, string>;
		multiple?: boolean;
	},
) {
	return buildField("select", apiAccessor, options, ["options", "multiple"]);
}

export function section(name: string, children: Field[]): Field[] {
	const sectionField: Field = {
		field_type: "section",
		config: {
			name,
			api_accessor: `section_${name.toLowerCase().replace(/\s+/g, "_")}`,
			required: false,
			instructions: "",
		},
		settings: null,
		children: null,
		system: false,
	};
	return [sectionField, ...children];
}
