// src/rich-text-spec/__tests__/deprecation.test.ts
//
// ADR-0026 retires `/rich-text-spec` in 0.19: every export the subpath
// offers must say so in its JSDoc, where an editor strikes it through and a
// Consumer's lint can find it. Read through the compiler, so a new export
// without the tag fails here rather than slipping into a release unmarked.
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const entry = path.resolve(__dirname, "../index.ts");

function deprecationsByExport(): Map<string, string | undefined> {
	const program = ts.createProgram([entry], {
		jsx: ts.JsxEmit.ReactJSX,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		target: ts.ScriptTarget.ES2022,
		skipLibCheck: true,
		noEmit: true,
	});
	const checker = program.getTypeChecker();
	const source = program.getSourceFile(entry);
	if (!source) throw new Error(`cannot read ${entry}`);
	const moduleSymbol = checker.getSymbolAtLocation(source);
	if (!moduleSymbol) throw new Error(`${entry} is not a module`);

	const out = new Map<string, string | undefined>();
	for (const exported of checker.getExportsOfModule(moduleSymbol)) {
		const target =
			exported.flags & ts.SymbolFlags.Alias
				? checker.getAliasedSymbol(exported)
				: exported;
		const tag = target
			.getJsDocTags(checker)
			.find((t) => t.name === "deprecated");
		out.set(
			exported.getName(),
			tag ? ts.displayPartsToString(tag.text) : undefined,
		);
	}
	return out;
}

describe("/rich-text-spec deprecation (ADR-0026)", () => {
	const deprecations = deprecationsByExport();

	it("reads the subpath's exports", () => {
		expect([...deprecations.keys()].sort()).toEqual([
			"EditorNodeCategory",
			"EditorNodePlugin",
			"EditorSpec",
			"EditorSpecEditor",
			"EditorSpecEditorProps",
			"NodeOptions",
			"builtInEditorPlugins",
			"builtInMarkPlugins",
			"builtInNodePlugins",
		]);
	});

	it.each([
		...deprecations.keys(),
	])("%s is @deprecated with a pointer to ADR-0026", (name) => {
		const text = deprecations.get(name);
		expect(text, `${name} carries no @deprecated tag`).toBeDefined();
		expect(text).toContain("ADR-0026");
		expect(text).toContain("0.19");
	});
});
