import { describe, expect, it } from "vitest";
import { resolveMarkerConvention } from "../marker-convention";
import type { Field } from "../types";

function f(
	required: boolean,
	overrides: Partial<Field> = {},
	accessor = `f_${Math.trunc(Math.random() * 1e9)}`,
): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		settings: null,
		system: false,
		...overrides,
	};
}

describe("resolveMarkerConvention", () => {
	it("returns asterisk for an empty schema", () => {
		expect(resolveMarkerConvention([])).toBe("asterisk");
	});

	it("returns optional-text when required fields are the strict majority", () => {
		expect(resolveMarkerConvention([f(true), f(true), f(false)])).toBe(
			"optional-text",
		);
	});

	it("returns asterisk when optional fields are the majority", () => {
		expect(resolveMarkerConvention([f(true), f(false), f(false)])).toBe(
			"asterisk",
		);
	});

	it("returns asterisk on a tie", () => {
		expect(resolveMarkerConvention([f(true), f(false)])).toBe("asterisk");
	});

	it("excludes section fields from the count", () => {
		const section = f(false, { field_type: "section" });
		// Without the exclusion this would be 2 required vs 2 optional = tie.
		expect(resolveMarkerConvention([section, f(true), f(true), f(false)])).toBe(
			"optional-text",
		);
	});

	it("recurses into group children and counts the group itself", () => {
		const group = f(false, {
			field_type: "group",
			children: [f(true), f(true), f(true)],
		});
		// group (optional) + 3 required children → 3 vs 1 → optional-text.
		expect(resolveMarkerConvention([group])).toBe("optional-text");
	});

	it("excludes hidden fields from the count", () => {
		const hiddenOptional = f(false, {
			config: {
				name: "h",
				api_accessor: "h",
				required: false,
				instructions: "",
				hidden: true,
			},
		});
		// Visible fields: 2 required vs 1 optional → optional-text. The
		// three hidden optional fields would flip it to asterisk if counted.
		expect(
			resolveMarkerConvention([
				f(true),
				f(true),
				f(false),
				hiddenOptional,
				hiddenOptional,
				hiddenOptional,
			]),
		).toBe("optional-text");
	});

	it("excludes a hidden group's children from the count", () => {
		const hiddenGroup = f(false, {
			field_type: "group",
			config: {
				name: "hg",
				api_accessor: "hg",
				required: false,
				instructions: "",
				hidden: true,
			},
			children: [f(true), f(true), f(true)],
		});
		// Visible: 1 required vs 2 optional → asterisk. The hidden group's
		// three required children would flip it to optional-text if counted.
		expect(
			resolveMarkerConvention([f(true), f(false), f(false), hiddenGroup]),
		).toBe("asterisk");
	});
});
