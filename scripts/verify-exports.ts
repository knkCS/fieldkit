/**
 * verify-exports — Asserts every source-side export of a tsup entry surfaces
 * in its built `.d.ts` artifact.
 *
 * Why: We shipped @knkcs/anker@1.10.0 with a broken tarball — IdentityCell,
 * DeviceCell, parseUserAgent, formatUserAgent were re-exported from
 * src/components/data-table/cells/index.ts but NOT re-exported from
 * src/components/index.ts (the tsup entry). The published bundle had no
 * declarations for them, breaking consumers despite all green CI.
 *
 * What this script does:
 *   1. Reads tsup.config.ts to get the entry map.
 *   2. For each entry source file, walks the AST collecting the transitive
 *      closure of named exports. Recursion rules:
 *        - `export * from "./relative"` always recurses (semantically
 *          re-exports everything).
 *        - `export { ... } from "./relative-barrel/index"` recurses into the
 *          target's full transitive export set. Barrel files (`index.ts` /
 *          `index.tsx`) are conventionally 1:1 mirrors of their public API, so
 *          missing a name in the parent's curly braces is the bug-class we
 *          want to catch (the historic 1.10.0 IdentityCell omission).
 *        - `export { ... } from "./relative-leaf"` (any non-index file) takes
 *          ONLY the listed names — leaf files may legitimately mix public
 *          and internal exports.
 *        - `export ... from "external-pkg"` (non-relative): take the listed
 *          names (we can't resolve external packages).
 *   3. Parses the corresponding built `.d.ts` and extracts its declared exports.
 *   4. Reports any source-side names missing from the dist-side, with a clear
 *      provenance trail (which sub-barrel surfaced the symbol).
 *
 * Edge cases handled:
 *   - `export * from "./foo"` (recursion)
 *   - `export type { Foo } from "./foo"` (type-only)
 *   - `export { Foo as Bar } from "./foo"` (rename — Bar is surfaced)
 *   - `export default Foo` at the entry file (tracked as "default"; ignored
 *     when reached via re-export chain since renaming is the norm there)
 *   - regular imports: ignored (we walk the export tree only)
 *   - circular re-exports: visited-set guard + max-depth ceiling (10 levels)
 *
 * Run: tsx scripts/verify-exports.ts            # verify against current dist
 *      tsx scripts/verify-exports.ts --self-test # run inline unit tests
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const MAX_DEPTH = 10;

interface ExportInfo {
	/** The exported name as seen by consumers (post-rename). */
	name: string;
	/** Absolute path to the source file that declares (or re-exports) this name. */
	sourceFile: string;
	/**
	 * For re-exports, the chain of files traversed from the entry to the
	 * declaring file (most recent re-export last). Empty for direct declarations
	 * in the entry file itself.
	 */
	chain: string[];
}

interface EntrySpec {
	/** Logical entry name from tsup config, e.g. "components/index". */
	name: string;
	/** Absolute path to the source entry file (e.g. src/components/index.ts). */
	source: string;
}

/**
 * Parse tsup.config.ts and return the entry map. Uses the TS compiler API to
 * walk the AST rather than executing the config (avoids a transpile step).
 */
function readTsupEntries(configPath: string): EntrySpec[] {
	const sf = ts.createSourceFile(
		configPath,
		readFileSync(configPath, "utf-8"),
		ts.ScriptTarget.Latest,
		true,
	);
	const entries: EntrySpec[] = [];

	function visit(node: ts.Node): void {
		// Match: entry: { "x/index": "src/x/index.ts", ... }
		if (
			ts.isPropertyAssignment(node) &&
			ts.isIdentifier(node.name) &&
			node.name.text === "entry" &&
			ts.isObjectLiteralExpression(node.initializer)
		) {
			for (const prop of node.initializer.properties) {
				if (
					ts.isPropertyAssignment(prop) &&
					(ts.isStringLiteral(prop.name) || ts.isIdentifier(prop.name)) &&
					ts.isStringLiteral(prop.initializer)
				) {
					const key = ts.isStringLiteral(prop.name) ? prop.name.text : prop.name.text;
					entries.push({
						name: key,
						source: resolve(ROOT, prop.initializer.text),
					});
				}
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(sf);

	if (entries.length === 0) {
		throw new Error(`No entries found in ${configPath}`);
	}
	return entries;
}

/**
 * True if the file is a barrel-shaped module (`index.ts` or `index.tsx`).
 * Barrels are conventionally 1:1 mirrors of their directory's public API and
 * are widened during sub-barrel walks. Leaf files (e.g. `app-shell.tsx`) are
 * not — they may mix public and internal exports, and only names explicitly
 * listed by the parent barrel's curly-brace clause are surfaced.
 */
function isBarrelFile(file: string): boolean {
	return /[\\/]index\.(ts|tsx)$/.test(file);
}

/**
 * Resolve an `export ... from "./relative"` specifier against a containing file.
 * Tries `.ts`, `.tsx`, then `index.ts`, then `index.tsx` in a directory.
 */
function resolveRelative(fromFile: string, spec: string): string | null {
	const base = resolve(dirname(fromFile), spec);
	const candidates = [
		`${base}.ts`,
		`${base}.tsx`,
		join(base, "index.ts"),
		join(base, "index.tsx"),
	];
	for (const c of candidates) {
		if (existsSync(c)) return c;
	}
	return null;
}

/**
 * Walk a source file and collect the set of named exports it exposes, recursing
 * into sub-barrels reached through `export ... from "./relative"`.
 */
function collectSourceExports(
	entryFile: string,
	options: { followRelative?: boolean } = { followRelative: true },
): ExportInfo[] {
	const collected = new Map<string, ExportInfo>();
	const visited = new Set<string>();

	function walk(file: string, chain: string[], depth: number): void {
		if (depth > MAX_DEPTH) {
			throw new Error(
				`verify-exports: max recursion depth (${MAX_DEPTH}) exceeded — circular re-export?\n  chain: ${chain.join(" -> ")}`,
			);
		}
		if (visited.has(file)) return;
		visited.add(file);

		const text = readFileSync(file, "utf-8");
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

		for (const stmt of sf.statements) {
			// `export { Foo, Bar as Baz } [from "./mod"]`
			if (ts.isExportDeclaration(stmt)) {
				const moduleSpec =
					stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)
						? stmt.moduleSpecifier.text
						: null;

				// `export * from "./mod"` — recurse and pull in every named export.
				if (!stmt.exportClause && moduleSpec) {
					if (!options.followRelative || !moduleSpec.startsWith(".")) continue;
					const target = resolveRelative(file, moduleSpec);
					if (!target) continue;
					walk(target, [...chain, file], depth + 1);
					continue;
				}

				// `export * as ns from "./mod"` — namespace re-export. Surface "ns" itself.
				if (
					stmt.exportClause &&
					ts.isNamespaceExport(stmt.exportClause) &&
					moduleSpec
				) {
					addExport({
						name: stmt.exportClause.name.text,
						sourceFile: file,
						chain: [...chain],
					});
					continue;
				}

				// `export { A, B as C } [from "./mod"]`
				//
				// Heuristic — widen only when the target is a BARREL file
				// (named `index.ts` or `index.tsx`). The convention in this
				// codebase (and most TS libraries) is that an `index.ts` barrel
				// surfaces its directory's full public API, while a sibling leaf
				// file (`foo.tsx`) may legitimately mix public and internal
				// exports. When the parent barrel writes
				// `export { A } from "./sub-barrel"`, that `sub-barrel/index.ts`
				// is presumed to be a 1:1 mirror of its public surface — so any
				// name it exposes should also be re-exported here. When the
				// parent writes `export { A } from "./leaf"`, only A is taken;
				// leaf-internal exports stay internal.
				//
				// This is the bug-catching move: if `components/index.ts` says
				// `export { Foo } from "./data-table"` and `data-table/index.ts`
				// (a barrel) also exposes `Bar`, we expect `Bar` in the dist
				// even though it wasn't listed in the curly braces.
				//
				// On top of the recursive walk, we also surface the EXPOSED
				// names (post-rename) of explicit elements — handles
				// `export { Foo as Bar }` where Bar is the consumer-facing
				// name and would otherwise be invisible to us.
				if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
					if (moduleSpec && moduleSpec.startsWith(".") && options.followRelative) {
						const target = resolveRelative(file, moduleSpec);
						if (target && isBarrelFile(target)) {
							walk(target, [...chain, file], depth + 1);
							for (const elem of stmt.exportClause.elements) {
								addExport({
									name: elem.name.text,
									sourceFile: target,
									chain: [...chain, file],
								});
							}
							continue;
						}
						// Leaf target (or unresolved): strict — take only listed names.
						for (const elem of stmt.exportClause.elements) {
							addExport({
								name: elem.name.text,
								sourceFile: target ?? file,
								chain: [...chain, file],
							});
						}
						continue;
					}
					// No relative target (external module): just take the listed names.
					for (const elem of stmt.exportClause.elements) {
						addExport({
							name: elem.name.text,
							sourceFile: file,
							chain: [...chain, file],
						});
					}
					continue;
				}
			}

			// `export const|let|var X = ...`, `export function X()`, `export class X {}`,
			// `export interface X {}`, `export type X = ...`, `export enum X {}`
			if (
				(ts.isVariableStatement(stmt) ||
					ts.isFunctionDeclaration(stmt) ||
					ts.isClassDeclaration(stmt) ||
					ts.isInterfaceDeclaration(stmt) ||
					ts.isTypeAliasDeclaration(stmt) ||
					ts.isEnumDeclaration(stmt)) &&
				hasExportModifier(stmt)
			) {
				if (ts.isVariableStatement(stmt)) {
					for (const decl of stmt.declarationList.declarations) {
						if (ts.isIdentifier(decl.name)) {
							addExport({ name: decl.name.text, sourceFile: file, chain: [...chain] });
						}
					}
				} else if (stmt.name) {
					addExport({ name: stmt.name.text, sourceFile: file, chain: [...chain] });
				}
				continue;
			}

			// `export default ...`
			//
			// We only count `default` when it's declared in the entry file itself.
			// Through re-export chains, `default` is almost always renamed
			// (`export { default as Foo } from "./leaf"`) and the original `default`
			// is no longer exposed at the entry. Counting it would generate false
			// positives. Defaults aren't part of the historic-bug class anyway.
			if (
				file === entryFile &&
				(ts.isExportAssignment(stmt) ||
					(ts.isFunctionDeclaration(stmt) && hasDefaultModifier(stmt)) ||
					(ts.isClassDeclaration(stmt) && hasDefaultModifier(stmt)))
			) {
				addExport({ name: "default", sourceFile: file, chain: [...chain] });
				continue;
			}
		}
	}

	function addExport(e: ExportInfo): void {
		// First-write-wins: a closer/earlier source attribution is more useful for
		// error messages. Later overlapping declarations keep the first attribution.
		if (!collected.has(e.name)) collected.set(e.name, e);
	}

	walk(entryFile, [], 0);
	return [...collected.values()];
}

function hasExportModifier(node: ts.Node): boolean {
	const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function hasDefaultModifier(node: ts.Node): boolean {
	const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
	return !!mods?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
}


/**
 * Walk a built `.d.ts` and return the set of named export identifiers it
 * declares (post-rename). Handles tsup's typical aggregated `export { ... }`
 * form as well as inline `export interface`, `export declare`, etc.
 */
function collectDtsExports(file: string): Set<string> {
	const text = readFileSync(file, "utf-8");
	const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
	const out = new Set<string>();

	for (const stmt of sf.statements) {
		if (ts.isExportDeclaration(stmt)) {
			if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
				for (const elem of stmt.exportClause.elements) {
					out.add(elem.name.text);
				}
			} else if (stmt.exportClause && ts.isNamespaceExport(stmt.exportClause)) {
				out.add(stmt.exportClause.name.text);
			}
			continue;
		}
		if (
			(ts.isVariableStatement(stmt) ||
				ts.isFunctionDeclaration(stmt) ||
				ts.isClassDeclaration(stmt) ||
				ts.isInterfaceDeclaration(stmt) ||
				ts.isTypeAliasDeclaration(stmt) ||
				ts.isEnumDeclaration(stmt)) &&
			hasExportModifier(stmt)
		) {
			if (ts.isVariableStatement(stmt)) {
				for (const decl of stmt.declarationList.declarations) {
					if (ts.isIdentifier(decl.name)) out.add(decl.name.text);
				}
			} else if (stmt.name) {
				out.add(stmt.name.text);
			}
			continue;
		}
		if (ts.isExportAssignment(stmt)) {
			out.add("default");
		}
	}
	return out;
}

interface MissingReport {
	entry: string;
	missing: ExportInfo[];
}

function verifyEntry(entry: EntrySpec): MissingReport | null {
	const dts = resolve(ROOT, "dist", `${entry.name}.d.ts`);
	if (!existsSync(dts)) {
		throw new Error(
			`verify-exports: dist artifact missing for entry "${entry.name}" — expected ${dts}. Did you forget to run \`npm run build\`?`,
		);
	}
	const sourceExports = collectSourceExports(entry.source);
	const dtsExports = collectDtsExports(dts);

	const missing = sourceExports.filter((e) => !dtsExports.has(e.name));
	if (missing.length === 0) return null;
	return { entry: entry.name, missing };
}

function formatProvenance(e: ExportInfo): string {
	const decl = relative(ROOT, e.sourceFile);
	if (e.chain.length <= 1) return decl;
	const via = e.chain.slice(1).map((f) => relative(ROOT, f)).join(" -> ");
	return `${decl} (via ${via})`;
}

function runVerification(): number {
	const tsupCfg = resolve(ROOT, "tsup.config.ts");
	const entries = readTsupEntries(tsupCfg);

	const reports: MissingReport[] = [];
	for (const entry of entries) {
		const r = verifyEntry(entry);
		if (r) reports.push(r);
	}

	if (reports.length === 0) {
		console.log(
			`verify-exports: ok — ${entries.length} tsup entries match their built .d.ts`,
		);
		return 0;
	}

	for (const r of reports) {
		console.error(`\n✗ entry "${r.entry}": missing in dist:`);
		for (const m of r.missing) {
			console.error(`  - ${m.name} (declared in ${formatProvenance(m)})`);
		}
	}
	console.error(
		`\nverify-exports: FAILED — ${reports.reduce((n, r) => n + r.missing.length, 0)} missing symbol(s) across ${reports.length} entry(s).`,
	);
	console.error(
		"  These names are exported from the source-side closure rooted at the tsup entry,",
	);
	console.error(
		"  but absent from the built .d.ts. Re-export them from the parent barrel file",
	);
	console.error("  (the tsup entry source) and rebuild.");
	return 1;
}

// ---------------------------------------------------------------------------
// Self-test mode (--self-test)
//
// Generates synthetic source files in a tmp directory and verifies the
// extraction logic. Uses TS compiler API the same way the real verifier does.
// ---------------------------------------------------------------------------

function selfTest(): number {
	const tmp = resolve(ROOT, ".tmp-verify-exports-self-test");
	rmSync(tmp, { recursive: true, force: true });
	mkdirSync(tmp, { recursive: true });

	let failures = 0;
	const assert = (label: string, cond: boolean, detail?: string) => {
		if (cond) {
			console.log(`  ok  ${label}`);
		} else {
			failures++;
			console.error(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
		}
	};

	function setup(files: Record<string, string>): void {
		for (const [path, content] of Object.entries(files)) {
			const full = join(tmp, path);
			mkdirSync(dirname(full), { recursive: true });
			writeFileSync(full, content);
		}
	}

	// Test 1: happy path — entry re-exports a sub-barrel; both names surface in dist.
	{
		setup({
			"src1/index.ts": `export { Foo } from "./sub";\nexport { Bar } from "./other";\n`,
			"src1/sub.ts": `export const Foo = 1;\n`,
			"src1/other.ts": `export const Bar = 2;\n`,
			"dist1/index.d.ts": `declare const Foo: number;\ndeclare const Bar: number;\nexport { Foo, Bar };\n`,
		});
		const src = collectSourceExports(join(tmp, "src1/index.ts"));
		const dts = collectDtsExports(join(tmp, "dist1/index.d.ts"));
		const missing = src.filter((e) => !dts.has(e.name)).map((e) => e.name);
		assert("happy path: no missing exports", missing.length === 0, missing.join(","));
	}

	// Test 2: missing-export failure — historic 1.10.0 bug shape.
	{
		setup({
			"src2/index.ts": `export { Card } from "./card";\n`,
			"src2/card.ts": `export const Card = 1;\n`,
			// Note: cells barrel is not re-exported from src2/index.ts at all.
			// In the real bug the cells barrel WAS imported by `data-table/index.ts`
			// which in turn was imported by `components/index.ts` — but only some
			// names were re-listed in the components barrel. We simulate the
			// "forgot to re-export" shape: dist has Card but not Cell.
			"dist2/index.d.ts": `declare const Card: number;\nexport { Card };\n`,
		});
		// Add a missing export to source: pretend index.ts also re-exports Cell:
		writeFileSync(
			join(tmp, "src2/index.ts"),
			`export { Card } from "./card";\nexport { Cell } from "./cell";\n`,
		);
		writeFileSync(join(tmp, "src2/cell.ts"), `export const Cell = 1;\n`);
		const src = collectSourceExports(join(tmp, "src2/index.ts"));
		const dts = collectDtsExports(join(tmp, "dist2/index.d.ts"));
		const missing = src.filter((e) => !dts.has(e.name)).map((e) => e.name);
		assert(
			"missing-export failure detected",
			missing.length === 1 && missing[0] === "Cell",
			`missing=${missing.join(",")}`,
		);
	}

	// Test 3: `export * from` recursion.
	{
		setup({
			"src3/index.ts": `export * from "./sub";\n`,
			"src3/sub/index.ts": `export { A } from "./a";\nexport { B } from "./b";\n`,
			"src3/sub/a.ts": `export const A = 1;\n`,
			"src3/sub/b.ts": `export const B = 2;\n`,
		});
		const src = collectSourceExports(join(tmp, "src3/index.ts"));
		const names = src.map((e) => e.name).sort();
		assert(
			"export * recursion picks up A and B",
			names.length === 2 && names[0] === "A" && names[1] === "B",
			`names=${names.join(",")}`,
		);
	}

	// Test 4: rename — `export { Foo as Bar } from "./foo"`.
	// Sub-barrel walk picks up Foo; rename overlay picks up Bar.
	// Both are surfaced; the dist is expected to have at least Bar.
	{
		setup({
			"src4/index.ts": `export { Foo as Bar } from "./foo";\n`,
			"src4/foo.ts": `export const Foo = 1;\n`,
			"dist4/index.d.ts": `declare const Bar: number;\nexport { Bar };\n`,
		});
		const src = collectSourceExports(join(tmp, "src4/index.ts"));
		const names = src.map((e) => e.name).sort();
		assert(
			"rename: surfaces Bar (the consumer-facing name)",
			names.includes("Bar"),
			`names=${names.join(",")}`,
		);
		const dts = collectDtsExports(join(tmp, "dist4/index.d.ts"));
		// The dist correctly has Bar; Foo is internal to the sub-barrel and not
		// exposed at the entry, so its absence in dist would flag — but in this
		// minimal synthetic test, we just confirm Bar is checked.
		assert(
			"rename: Bar present in dist (no missing for Bar)",
			dts.has("Bar"),
			`dts has=${[...dts].join(",")}`,
		);
	}

	// Test 5: type-only export.
	{
		setup({
			"src5/index.ts": `export type { TFoo } from "./foo";\nexport { Foo } from "./foo";\n`,
			"src5/foo.ts": `export type TFoo = number;\nexport const Foo = 1;\n`,
			"dist5/index.d.ts": `type TFoo = number;\ndeclare const Foo: number;\nexport { Foo, type TFoo };\n`,
		});
		const src = collectSourceExports(join(tmp, "src5/index.ts"));
		const dts = collectDtsExports(join(tmp, "dist5/index.d.ts"));
		const srcNames = src.map((e) => e.name).sort();
		const missing = src.filter((e) => !dts.has(e.name)).map((e) => e.name);
		assert(
			"type-only export: TFoo surfaced from source",
			srcNames.includes("TFoo") && srcNames.includes("Foo"),
			`names=${srcNames.join(",")}`,
		);
		assert("type-only export: no missing in dts", missing.length === 0, missing.join(","));
	}

	// Test 6: circular re-export bails with clear error within max depth.
	{
		setup({
			"src6/a.ts": `export * from "./b";\n`,
			"src6/b.ts": `export * from "./a";\n`,
		});
		let threw = false;
		try {
			collectSourceExports(join(tmp, "src6/a.ts"));
		} catch (e) {
			// `visited` guard means our impl will return cleanly, not throw.
			// To prove the depth guard works at all, build a deeper chain instead.
			threw = true;
		}
		assert(
			"circular re-export: visited-guard prevents infinite recursion",
			!threw,
			"should NOT throw thanks to visited set",
		);
	}

	// Test 7: ignores non-relative `export ... from "external"`.
	{
		setup({
			"src7/index.ts": `export { Something } from "external-pkg";\nexport { Local } from "./local";\n`,
			"src7/local.ts": `export const Local = 1;\n`,
		});
		const src = collectSourceExports(join(tmp, "src7/index.ts"));
		const names = src.map((e) => e.name).sort();
		assert(
			"external re-export: surfaces Something at the entry level",
			names.includes("Something") && names.includes("Local"),
			`names=${names.join(",")}`,
		);
	}

	// Test 8: leaf-vs-barrel heuristic. Named-list re-export from a leaf .tsx
	// takes only the listed names. From a barrel index.ts, widens to the full
	// transitive set.
	{
		setup({
			// Leaf form: app-shell.tsx mixes public + internal exports.
			"src8a/index.ts": `export { Public } from "./app-shell";\n`,
			"src8a/app-shell.tsx": `export const Public = 1;\nexport const Internal = 2;\n`,
			// Barrel form: data-table/index.ts is a sub-barrel.
			"src8b/index.ts": `export { A } from "./sub";\n`,
			"src8b/sub/index.ts": `export { A } from "./a";\nexport { B } from "./b";\n`,
			"src8b/sub/a.ts": `export const A = 1;\n`,
			"src8b/sub/b.ts": `export const B = 2;\n`,
		});
		const leaf = collectSourceExports(join(tmp, "src8a/index.ts"));
		const leafNames = leaf.map((e) => e.name).sort();
		assert(
			"leaf .tsx target: strict — Internal NOT surfaced",
			leafNames.includes("Public") && !leafNames.includes("Internal"),
			`names=${leafNames.join(",")}`,
		);
		const barrel = collectSourceExports(join(tmp, "src8b/index.ts"));
		const barrelNames = barrel.map((e) => e.name).sort();
		assert(
			"barrel index.ts target: widens — both A and B surfaced",
			barrelNames.includes("A") && barrelNames.includes("B"),
			`names=${barrelNames.join(",")}`,
		);
	}

	// Test 9: simulated 1.10.0 bug. Parent barrel uses named list and forgot to
	// list a name from the sub-barrel. The verifier MUST flag the missing name.
	{
		setup({
			"src9/index.ts": `export { DataTable } from "./data-table";\n`,
			"src9/data-table/index.ts": `export * from "./cells";\nexport { DataTable } from "./data-table";\n`,
			"src9/data-table/data-table.tsx": `export const DataTable = 1;\n`,
			"src9/data-table/cells/index.ts": `export { IdentityCell } from "./identity-cell";\n`,
			"src9/data-table/cells/identity-cell.tsx": `export const IdentityCell = 1;\n`,
			"dist9/index.d.ts": `declare const DataTable: number;\nexport { DataTable };\n`,
		});
		const src = collectSourceExports(join(tmp, "src9/index.ts"));
		const dts = collectDtsExports(join(tmp, "dist9/index.d.ts"));
		const missing = src.filter((e) => !dts.has(e.name)).map((e) => e.name);
		assert(
			"1.10.0 simulated bug: IdentityCell flagged as missing",
			missing.includes("IdentityCell"),
			`missing=${missing.join(",")}`,
		);
	}

	rmSync(tmp, { recursive: true, force: true });

	if (failures === 0) {
		console.log(`\nverify-exports self-test: ok`);
		return 0;
	}
	console.error(`\nverify-exports self-test: ${failures} failure(s)`);
	return 1;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const isSelfTest = process.argv.includes("--self-test");
process.exit(isSelfTest ? selfTest() : runVerification());
