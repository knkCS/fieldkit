// src/rich-text-spec/__tests__/node-plugins.test.ts
import { describe, expect, it } from "vitest";
import {
	builtInCoreNodePlugins,
	builtInEditorPlugins,
	builtInMarkPlugins,
	builtInMediaNodePlugins,
	builtInNodePlugins,
	contentLinkPlugin,
	footnotePlugin,
	headingPlugin,
	imagePlugin,
	paragraphPlugin,
	weblinkPlugin,
} from "../node-plugins";

describe("Built-in mark plugins", () => {
	it("has 6 mark plugins", () => {
		expect(builtInMarkPlugins).toHaveLength(6);
	});

	it("all marks have isMark set to true", () => {
		for (const plugin of builtInMarkPlugins) {
			expect(plugin.isMark).toBe(true);
		}
	});

	it("all marks have category 'formatting'", () => {
		for (const plugin of builtInMarkPlugins) {
			expect(plugin.category).toBe("formatting");
		}
	});

	it("all marks have an icon", () => {
		for (const plugin of builtInMarkPlugins) {
			expect(plugin.icon).toBeDefined();
		}
	});

	it("all marks have unique ids", () => {
		const ids = builtInMarkPlugins.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("contains the expected mark ids", () => {
		const ids = builtInMarkPlugins.map((p) => p.id);
		expect(ids).toEqual([
			"bold",
			"italic",
			"underline",
			"strike",
			"subscript",
			"superscript",
		]);
	});
});

describe("Built-in core node plugins", () => {
	it("has 8 core node plugins", () => {
		expect(builtInCoreNodePlugins).toHaveLength(8);
	});

	it("all core nodes have isMark set to false", () => {
		for (const plugin of builtInCoreNodePlugins) {
			expect(plugin.isMark).toBe(false);
		}
	});

	it("all core nodes have category 'structure'", () => {
		for (const plugin of builtInCoreNodePlugins) {
			expect(plugin.category).toBe("structure");
		}
	});

	it("heading plugin has settingsSpec", () => {
		expect(headingPlugin.settingsSpec).toBeDefined();
		expect(headingPlugin.settingsSpec).toHaveLength(1);
		expect(headingPlugin.defaultSettings?.levels).toEqual([1, 2, 3]);
	});

	it("paragraph plugin is defaultEnabled", () => {
		expect(paragraphPlugin.defaultEnabled).toBe(true);
	});
});

describe("Built-in media node plugins", () => {
	it("has 4 media/reference/special node plugins", () => {
		expect(builtInMediaNodePlugins).toHaveLength(4);
	});

	it("image is in the 'media' category", () => {
		expect(imagePlugin.category).toBe("media");
	});

	it("contentLink and weblink are in the 'reference' category", () => {
		expect(contentLinkPlugin.category).toBe("reference");
		expect(weblinkPlugin.category).toBe("reference");
	});

	it("footnote is in the 'special' category", () => {
		expect(footnotePlugin.category).toBe("special");
	});
});

describe("Combined plugin arrays", () => {
	it("builtInNodePlugins contains core + media nodes", () => {
		expect(builtInNodePlugins).toHaveLength(
			builtInCoreNodePlugins.length + builtInMediaNodePlugins.length,
		);
		expect(builtInNodePlugins).toHaveLength(12);
	});

	it("builtInEditorPlugins contains marks + all nodes", () => {
		expect(builtInEditorPlugins).toHaveLength(
			builtInMarkPlugins.length + builtInNodePlugins.length,
		);
		expect(builtInEditorPlugins).toHaveLength(18);
	});

	it("all plugins across all arrays have unique ids", () => {
		const ids = builtInEditorPlugins.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("all plugins have required fields", () => {
		for (const plugin of builtInEditorPlugins) {
			expect(plugin.id).toBeTruthy();
			expect(plugin.name).toBeTruthy();
			expect(plugin.description).toBeTruthy();
			expect(plugin.category).toBeTruthy();
			expect(typeof plugin.isMark).toBe("boolean");
			expect(typeof plugin.defaultEnabled).toBe("boolean");
		}
	});

	it("all plugins have an icon", () => {
		for (const plugin of builtInEditorPlugins) {
			expect(plugin.icon).toBeDefined();
		}
	});
});
