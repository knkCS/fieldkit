import { ChakraProvider } from "@chakra-ui/react";
import type { EditorProps } from "@knkcms/knkeditor-editor";
import { Button } from "@knkcs/anker/atoms";
import system from "@knkcs/anker/theme";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { FieldRenderer } from "../../renderer/field-renderer";
import { FieldKitProvider } from "../../renderer/provider";
import { SpecForm } from "../../renderer/spec-form/spec-form";
import { builtInFieldTypes } from "../../schema/field-types";
import type { FieldTypePlugin } from "../../schema/plugin";
import { resolveSpec } from "../../schema/resolve-spec";
import { knkRichTextPlugin } from "..";
import { ARTICLE_TEXT_TYPE, bodyField, storedDocument } from "./fixture";

// knkeditor in its own scoped Chakra system, growing with its document
// (ADR-0026, amended): through the subpath's public field, under anker's
// theme as every knkCS Consumer renders it.

// The real editor, with the props each mount got recorded.
const editorProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@knkcms/knkeditor-editor", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@knkcms/knkeditor-editor")>();
	const Real = actual.default;
	function Recorded(props: EditorProps) {
		editorProps.push(props as unknown as Record<string, unknown>);
		return <Real {...props} />;
	}
	return { ...actual, default: Recorded };
});

const SCOPE = ".fieldkit-knkeditor";

const plugins: FieldTypePlugin[] = builtInFieldTypes.map((plugin) =>
	plugin.id === "rich_text" ? knkRichTextPlugin : plugin,
);

const resolveUnder = (textType: unknown) =>
	resolveSpec(
		[bodyField()],
		{ parts: { text_type: async () => textType } },
		{ plugins },
	);

function Form({ children }: { children: ReactNode }) {
	const methods = useForm({ defaultValues: { body: storedDocument() } });
	return <FormProvider {...methods}>{children}</FormProvider>;
}

/** The last props knkeditor's editor mounted with. */
const lastEditorProps = () => editorProps[editorProps.length - 1];

async function editField(textType: unknown) {
	const resolved = await resolveUnder(textType);
	editorProps.length = 0;
	const view = render(
		<ChakraProvider value={system}>
			<FieldKitProvider plugins={plugins} parts={resolved.parts}>
				<Form>
					<FieldRenderer schema={resolved.fields} />
				</Form>
			</FieldKitProvider>
		</ChakraProvider>,
	);
	await waitFor(() =>
		expect(view.container.querySelector(".ProseMirror")).not.toBeNull(),
	);
	return view;
}

// --- The CSS that reaches an element ------------------------------------

/** The top-level blocks of a stylesheet's text: `[prelude, body]`, and
 * statements such as `@layer a, b;` as `[statement, null]`. */
function blocksOf(css: string): [string, string | null][] {
	const blocks: [string, string | null][] = [];
	let depth = 0;
	let start = 0;
	let open = -1;
	for (let i = 0; i < css.length; i++) {
		const c = css[i];
		if (c === "{") {
			if (depth === 0) open = i;
			depth++;
		} else if (c === "}") {
			depth--;
			if (depth === 0) {
				blocks.push([css.slice(start, open).trim(), css.slice(open + 1, i)]);
				start = i + 1;
			}
		} else if (c === ";" && depth === 0) {
			blocks.push([css.slice(start, i).trim(), null]);
			start = i + 1;
		}
	}
	return blocks;
}

/** A selector list's selectors: split at the commas outside parentheses. */
function splitSelectors(list: string): string[] {
	const selectors: string[] = [];
	let depth = 0;
	let start = 0;
	for (let i = 0; i < list.length; i++) {
		if (list[i] === "(") depth++;
		else if (list[i] === ")") depth--;
		else if (list[i] === "," && depth === 0) {
			selectors.push(list.slice(start, i).trim());
			start = i + 1;
		}
	}
	selectors.push(list.slice(start).trim());
	return selectors;
}

/** Every style rule on the page that applies to `element` or one of its
 * ancestors — what decides how it looks, inherited custom properties
 * included. Keyframes don't style anything by themselves. */
function rulesReaching(element: Element): string[] {
	const chain: Element[] = [];
	for (let e: Element | null = element; e; e = e.parentElement) chain.push(e);
	const reaching: string[] = [];
	const walk = (css: string) => {
		for (const [prelude, body] of blocksOf(css)) {
			if (body === null || /^@(-\w+-)?keyframes/.test(prelude)) continue;
			if (prelude.startsWith("@")) {
				walk(body);
				continue;
			}
			const matches = splitSelectors(prelude).some((selector) => {
				try {
					return chain.some((e) => e.matches(selector));
				} catch {
					// A selector jsdom can't evaluate (`:is()`, a pseudo-element)
					// reaches it unless it names a class nothing in the chain
					// has — outside parentheses, where `:not()` could invert it.
					const classes =
						selector
							.replace(/\([^()]*\)/g, "")
							.match(/\.[\w-]+/g)
							?.map((c) => c.slice(1)) ?? [];
					return classes.every((c) =>
						chain.some((e) => e.classList.contains(c)),
					);
				}
			});
			if (matches) reaching.push(`${prelude}{${body}}`);
		}
	};
	for (const style of document.querySelectorAll("style")) {
		walk(style.textContent ?? "");
	}
	return reaching.sort();
}

describe("knkeditor's scoped system", () => {
	it("renders the edit field inside the scope, with knkeditor's controls in it", async () => {
		const { container } = await editField(ARTICLE_TEXT_TYPE());
		const scope = container.querySelector(SCOPE);
		expect(scope).not.toBeNull();
		expect(scope?.querySelector(".ProseMirror")).not.toBeNull();
		// The toolbar, which anker's recipes restyled, is inside it too.
		expect(scope?.querySelector('[role="toolbar"], button')).not.toBeNull();
	});

	it("renders the read view inside the scope", async () => {
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());
		const { container } = render(
			<ChakraProvider value={system}>
				<FieldKitProvider plugins={plugins} parts={resolved.parts}>
					<SpecForm
						schema={resolved.fields}
						mode="read"
						values={{ body: storedDocument() }}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);
		await waitFor(() =>
			expect(container.querySelector(`${SCOPE} .ProseMirror`)).not.toBeNull(),
		);
	});

	it("leaves a sibling anker control as it was: no reset, global style or token reaches the page", async () => {
		function Page({ richText }: { richText: boolean }) {
			return (
				<ChakraProvider value={system}>
					<Button variant="solid">Sibling</Button>
					{richText && (
						<FieldKitProvider plugins={plugins} parts={resolved.parts}>
							<Form>
								<FieldRenderer schema={resolved.fields} />
							</Form>
						</FieldKitProvider>
					)}
				</ChakraProvider>
			);
		}
		const resolved = await resolveUnder(ARTICLE_TEXT_TYPE());

		// In both themes: Chakra writes a semantic token's light and dark
		// values under the `light` and `dark` conditions, not under the
		// scope's root.
		const reachingSibling = () => {
			const sibling = screen.getByText("Sibling");
			const light = rulesReaching(sibling);
			document.documentElement.classList.add("dark");
			try {
				return { light, dark: rulesReaching(sibling) };
			} finally {
				document.documentElement.classList.remove("dark");
			}
		};

		const without = render(<Page richText={false} />);
		const before = reachingSibling();
		expect(before.light.length).toBeGreaterThan(0);
		without.unmount();

		const { container } = render(<Page richText />);
		await waitFor(() =>
			expect(container.querySelector(".ProseMirror")).not.toBeNull(),
		);
		expect(reachingSibling()).toEqual(before);
	});
});

describe("knkeditor's page", () => {
	it("grows with its document: no height cap, the toolbar fixed at the top of the field", async () => {
		await editField(ARTICLE_TEXT_TYPE());
		const props = lastEditorProps();
		expect(props.toolbarPosition).toBe("fixed");
		// knkeditor caps a fixed-toolbar editor at calc(100vh - 200px) when
		// it is given no cap; `none` lifts it.
		expect(props.maxEditorHeight).toBe("none");
	});

	// knkeditor's Text Type has no page width (its keys are exactly nodes,
	// marks and minimumVocabularyVersion, and it refuses any other), so every
	// page is A4, as core's is for a Text Type without one.
	it("is A4", async () => {
		await editField(ARTICLE_TEXT_TYPE());
		expect(lastEditorProps().pageOptions).toEqual({ width: 210, margin: 10 });
	});
});
