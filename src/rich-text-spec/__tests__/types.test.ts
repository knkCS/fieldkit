// src/rich-text-spec/__tests__/types.test.ts
import { describe, expect, it } from "vitest";
import type { Field } from "../../schema/types";
import type {
	EditorNodeCategory,
	EditorNodePlugin,
	EditorSpec,
	NodeOptions,
} from "../types";

describe("Rich text spec types", () => {
	it("should create a valid EditorNodePlugin object", () => {
		const plugin: EditorNodePlugin = {
			id: "bold",
			name: "Bold",
			description: "Bold text formatting",
			category: "formatting",
			isMark: true,
			defaultEnabled: true,
		};

		expect(plugin.id).toBe("bold");
		expect(plugin.name).toBe("Bold");
		expect(plugin.category).toBe("formatting");
		expect(plugin.isMark).toBe(true);
		expect(plugin.defaultEnabled).toBe(true);
	});

	it("should support optional settingsSpec and defaultSettings", () => {
		const settingsField: Field = {
			field_type: "select",
			config: {
				name: "Levels",
				api_accessor: "levels",
				required: false,
				instructions: "Which heading levels to allow",
			},
			settings: null,
			children: null,
			system: false,
		};

		const plugin: EditorNodePlugin = {
			id: "heading",
			name: "Heading",
			description: "Section headings",
			category: "structure",
			isMark: false,
			defaultEnabled: true,
			settingsSpec: [settingsField],
			defaultSettings: { levels: [1, 2, 3] },
		};

		expect(plugin.settingsSpec).toHaveLength(1);
		expect(plugin.defaultSettings?.levels).toEqual([1, 2, 3]);
	});

	it("should support optional icon property", () => {
		const DummyIcon = ({ size: _size }: { size?: number | string }) => null;

		const plugin: EditorNodePlugin = {
			id: "italic",
			name: "Italic",
			description: "Italic text",
			category: "formatting",
			isMark: true,
			defaultEnabled: true,
			icon: DummyIcon,
		};

		expect(plugin.icon).toBe(DummyIcon);
	});

	it("should accept all valid EditorNodeCategory values", () => {
		const categories: EditorNodeCategory[] = [
			"formatting",
			"structure",
			"media",
			"reference",
			"special",
		];

		expect(categories).toHaveLength(5);
		for (const cat of categories) {
			const plugin: EditorNodePlugin = {
				id: `test-${cat}`,
				name: `Test ${cat}`,
				description: `Test plugin for ${cat}`,
				category: cat,
				isMark: false,
				defaultEnabled: false,
			};
			expect(plugin.category).toBe(cat);
		}
	});

	it("should create a valid EditorSpec object", () => {
		const spec: EditorSpec = {
			id: "default",
			name: "Default Editor",
			nodes: {
				paragraph: {},
				heading: { levels: [1, 2, 3] },
			},
			marks: {
				bold: {},
				italic: {},
			},
		};

		expect(spec.id).toBe("default");
		expect(spec.name).toBe("Default Editor");
		expect(Object.keys(spec.nodes)).toHaveLength(2);
		expect(Object.keys(spec.marks)).toHaveLength(2);
		expect(spec.nodes.heading).toEqual({ levels: [1, 2, 3] });
	});

	it("should support optional description and page_width in EditorSpec", () => {
		const spec: EditorSpec = {
			id: "print",
			name: "Print Editor",
			description: "Editor configured for print output",
			page_width: 210,
			nodes: { paragraph: {} },
			marks: {},
		};

		expect(spec.description).toBe("Editor configured for print output");
		expect(spec.page_width).toBe(210);
	});

	it("should allow empty nodes and marks in EditorSpec", () => {
		const spec: EditorSpec = {
			id: "minimal",
			name: "Minimal",
			nodes: {},
			marks: {},
		};

		expect(Object.keys(spec.nodes)).toHaveLength(0);
		expect(Object.keys(spec.marks)).toHaveLength(0);
	});

	it("should allow NodeOptions with arbitrary values", () => {
		const opts: NodeOptions = {
			levels: [1, 2, 3],
			defaultLevel: 2,
			label: "Heading",
			nested: { foo: "bar" },
		};

		expect(opts.levels).toEqual([1, 2, 3]);
		expect(opts.defaultLevel).toBe(2);
	});
});
