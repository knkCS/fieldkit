// The Resolved Spec's `vocabulary` (#216): the highest minimumVocabularyVersion
// among the Text Types a Spec pins, compared as knkeditor compares versions.
import { describe, expect, it } from "vitest";
import { ResolveSpecError, resolveSpec } from "../resolve-spec";
import type { Field } from "../types";
import {
	compareVersions,
	higherVocabulary,
	textTypeMinimum,
} from "../vocabulary-version";

function richText(accessor: string, textType?: string): Field {
	return {
		field_type: "rich_text",
		config: { name: accessor, api_accessor: accessor, required: false },
		settings: textType ? { text_type: textType } : null,
		children: null,
		system: false,
	};
}

const textType = (minimum: string | null) => ({
	minimumVocabularyVersion: minimum,
	nodes: { doc: { options: {} } },
	marks: {},
});

describe("compareVersions", () => {
	it("orders semantic versions by precedence, as knkeditor's CompareVersions", () => {
		const ordered = [
			"0.1.0",
			"0.2.0-alpha",
			"0.2.0-alpha.1",
			"0.2.0-alpha.beta",
			"0.2.0-beta.2",
			"0.2.0-beta.11",
			"0.2.0",
			"0.10.0",
			"1.0.0+build.5",
		];
		for (let i = 0; i < ordered.length - 1; i++) {
			expect(compareVersions(ordered[i], ordered[i + 1])).toBeLessThan(0);
			expect(compareVersions(ordered[i + 1], ordered[i])).toBeGreaterThan(0);
		}
		expect(compareVersions("1.0.0", "1.0.0+other")).toBe(0);
	});

	it("keeps the higher vocabulary, empty being none", () => {
		expect(higherVocabulary("", "0.1.0")).toBe("0.1.0");
		expect(higherVocabulary("0.3.0", "0.2.0")).toBe("0.3.0");
		expect(higherVocabulary("0.2.0", "")).toBe("0.2.0");
	});

	it("reads a Text Type's minimum, null when it states none", () => {
		expect(textTypeMinimum(textType("0.1.0"))).toBe("0.1.0");
		expect(textTypeMinimum(textType(null))).toBeNull();
		expect(textTypeMinimum(textType("latest"))).toBeUndefined();
		expect(textTypeMinimum("not a Text Type")).toBeUndefined();
	});
});

describe("resolveSpec — the vocabulary", () => {
	const parts = {
		text_type: async (id: string) =>
			({
				"a@1": textType("0.1.0"),
				"b@1": textType("0.2.0"),
				"c@1": textType(null),
				"bad@1": textType("latest"),
			})[id],
	};

	it("is the highest minimum among the Text Types pinned", async () => {
		const resolved = await resolveSpec(
			[richText("a", "a@1"), richText("b", "b@1"), richText("c", "c@1")],
			{ parts },
		);
		expect(resolved.vocabulary).toBe("0.2.0");
		expect(Object.keys(resolved.parts.text_type)).toEqual([
			"a@1",
			"b@1",
			"c@1",
		]);
	});

	it("is empty when no Text Type states one", async () => {
		const resolved = await resolveSpec([richText("c", "c@1"), richText("d")], {
			parts,
		});
		expect(resolved.vocabulary).toBe("");
	});

	it("refuses a Text Type whose minimum is not a semantic version", async () => {
		const failed = resolveSpec([richText("x", "bad@1")], { parts });
		await expect(failed).rejects.toBeInstanceOf(ResolveSpecError);
		await expect(failed).rejects.toMatchObject({
			code: "resolve_invalid_release",
			pin: { path: "/x/settings/text_type" },
		});
	});
});
