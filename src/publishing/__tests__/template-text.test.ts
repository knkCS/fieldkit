import { describe, expect, it } from "vitest";
import { texts } from "../../schema/content-walk";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { validateSpec } from "../../schema/validate-spec";
import { validateValue } from "../../schema/validate-value";
import { publishingFieldTypes, templateTextPlugin } from "..";

function template(settings?: unknown, required = false): Field {
	return {
		field_type: "template_text",
		config: {
			name: "Template",
			api_accessor: "template",
			required,
			instructions: "",
		},
		settings,
		system: false,
	} as Field;
}

const plugins: Map<string, FieldTypePlugin> = new Map(
	[...builtInFieldTypes, ...publishingFieldTypes].map((p) => [p.id, p]),
);

function codes(errors: { path: string; code: string }[]) {
	return errors.map(({ path, code }) => ({ path, code }));
}

describe("template_text", () => {
	it("takes the Blueprints it offers placeholders from, and nothing else", () => {
		expect(
			validateSpec(
				[template({ context_blueprints: ["bp-1", "bp-2"] })],
				plugins,
			).fieldErrors,
		).toEqual([]);
		expect(
			codes(
				validateSpec(
					[template({ context_blueprints: ["bp-1", 2], mode: "go" })],
					plugins,
				).fieldErrors,
			),
		).toEqual([
			{
				path: "/template/settings/context_blueprints/1",
				code: "invalid_setting",
			},
			{ path: "/template/settings/mode", code: "unknown_setting" },
		]);
	});

	it("holds a template's source as a string, whatever it parses as", () => {
		const spec = [template(undefined, true)];
		expect(
			validateValue(spec, { template: "{{ if .Count }}{{ end }" }, plugins),
		).toEqual([]);
		expect(codes(validateValue(spec, { template: 3 }, plugins))).toEqual([
			{ path: "/template", code: "invalid_type" },
		]);
		expect(codes(validateValue(spec, {}, plugins))).toEqual([
			{ path: "/template", code: "required" },
		]);
	});

	it("yields no text", async () => {
		expect(templateTextPlugin.catalogue?.hasText).toBe(false);
		expect(
			texts(
				{ catalogue: "", vocabulary: "", fields: [template()], parts: {} },
				{ template: "Hello {{ .Name }}" },
				plugins,
			),
		).toEqual([]);
	});
});
