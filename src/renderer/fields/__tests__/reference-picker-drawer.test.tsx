import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import type { Reference } from "../../../schema/reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";
import { INDENT_WIDTH } from "../reference-tree";

const ACCESSOR = "related";

function makeField(
	settings: ReferenceSettings | null,
): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: ACCESSOR,
			required: false,
			instructions: "",
		},
		settings,
		children: null,
		system: false,
	};
}

/** Reads the stored value straight from the form, so what the drawer promised
 * can be checked against the tree that was actually written. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	value = [],
	settings = { blueprints: ["article"] },
	readOnly = false,
	adapters,
}: {
	value?: Reference[];
	settings?: ReferenceSettings | null;
	readOnly?: boolean;
	adapters?: FieldKitAdapters;
} = {}) {
	const field = makeField(settings);
	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={
						adapters ?? {
							reference: createFakeReferenceAdapter({
								contents: fakeCatalogue(8),
							}),
						}
					}
				>
					<FormProvider {...methods}>
						<form noValidate>
							<FieldComponent field={field} readOnly={readOnly} />
							<StoredValue />
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Harness />);
}

/** Opens the drawer through the Add control, which appends at the root. */
async function openThroughAdd(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Add reference" }));
	return await screen.findByTestId("reference-picker");
}

/**
 * Opens the drawer through the insertion strip at `slot`, pointed `levels`
 * indent steps in.
 *
 * `fireEvent.click` rather than `user.click`: the latter moves the pointer to
 * the element's centre first, which in jsdom — where every rect is zeroes — is
 * the tree's left edge, throwing away the depth being pointed at.
 */
async function openThroughStrip(slot: number, levels = 0) {
	const strip = screen.queryAllByTestId("reference-insert-strip")[slot];
	fireEvent.mouseMove(strip, { clientX: levels * INDENT_WIDTH });
	const said = strip.getAttribute("aria-label") ?? "";
	fireEvent.click(strip);
	await screen.findByTestId("reference-picker");
	return said;
}

/** The steps on screen, in order, as `[title, active?]`. */
function steps(): [string, boolean][] {
	return screen
		.queryAllByTestId("reference-picker-step")
		.map((step) => [
			step.textContent?.replace(/^\d+/, "").trim() ?? "",
			step.getAttribute("aria-current") === "step",
		]);
}

/** The header line naming where the Reference will land. */
function destination(): string {
	return (
		screen.getByTestId("reference-picker-destination").textContent?.trim() ?? ""
	);
}

/** A tree of two roots, the first carrying two children. */
const branchedTree: Reference[] = [
	{ id: "article-1", children: [{ id: "article-2" }, { id: "article-3" }] },
	{ id: "article-4" },
];

describe("the add drawer's steps", () => {
	it("shows both steps, the first of them active, when the Field pins", async () => {
		const user = userEvent.setup();
		renderField({
			settings: { blueprints: ["article"], pin_mode: "release" },
		});

		await openThroughAdd(user);

		expect(steps()).toEqual([
			["Choose content", true],
			["Choose a release", false],
		]);
	});

	it("moves the mark to the second step once a Content is chosen", async () => {
		const user = userEvent.setup();
		renderField({
			settings: { blueprints: ["article"], pin_mode: "version" },
		});

		await openThroughAdd(user);
		await user.click(await screen.findByText("Content 3"));
		await screen.findByTestId("reference-picker-pin-step");

		// Exactly one step is current at a time, which is what
		// `aria-current="step"` promises — anker's documented rule for this
		// component, and the whole of what a screen reader is told.
		expect(steps()).toEqual([
			["Choose content", false],
			["Choose a version", true],
		]);
	});

	it("shows the one step it has when the Field does not pin", async () => {
		const user = userEvent.setup();
		renderField({
			settings: { blueprints: ["article"], pin_mode: "none" },
		});

		await openThroughAdd(user);

		// Present rather than absent: the drawer's chrome must not change shape
		// depending on a Field setting.
		expect(steps()).toEqual([["Choose content", true]]);
	});

	it("counts the steps from pin_mode alone, as the flow already does", async () => {
		const user = userEvent.setup();
		// A Spec written before pinning existed says nothing about it, which is
		// not pinning — and so is one step, exactly as picking a Content in it
		// stores and closes.
		renderField({ settings: { blueprints: ["article"] } });

		await openThroughAdd(user);

		expect(steps()).toEqual([["Choose content", true]]);
	});

	it("goes back to the first step with Back", async () => {
		const user = userEvent.setup();
		renderField({
			settings: { blueprints: ["article"], pin_mode: "release" },
		});

		await openThroughAdd(user);
		await user.click(await screen.findByText("Content 3"));
		const pinStep = await screen.findByTestId("reference-picker-pin-step");
		await user.click(within(pinStep).getByRole("button", { name: "Back" }));

		await screen.findByTestId("reference-picker");
		expect(steps()).toEqual([
			["Choose content", true],
			["Choose a release", false],
		]);
	});
});

describe("where the Reference will land", () => {
	it("repeats the sentence the strip carried, at the moment of choosing", async () => {
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		// The strip between Content 1 and its first child, pointed at the root
		// depth: a sibling of Content 1 that takes both its children with it.
		const said = await openThroughStrip(1, 0);

		expect(said).toBe(
			"Insert as a sibling of Content 1, adopting 2 References",
		);
		// The same fact at a later moment, in the same words. The strip's label
		// is off the screen by now, and this is where the write is committed.
		expect(destination()).toBe(said);
	});

	it("names the Reference it will nest under, one level in", async () => {
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		const said = await openThroughStrip(1, 1);

		expect(said).toBe("Insert as a child of Content 1");
		expect(destination()).toBe(said);
	});

	it("names the sibling it will precede, at the top of the tree", async () => {
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		const said = await openThroughStrip(0, 0);

		// The position core's strip cannot reach at all, so the line has to say
		// something true about a Reference arriving before every other one.
		expect(said).toBe("Insert as a sibling of Content 1");
		expect(destination()).toBe(said);
	});

	it("names a nested rank, not the branch's parent", async () => {
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		// Between Content 1's two children, at their own depth: the sibling it
		// follows is Content 2, never the Content 1 it hangs under.
		const said = await openThroughStrip(2, 1);

		expect(said).toBe("Insert as a sibling of Content 2");
		expect(destination()).toBe(said);
	});

	it("keeps saying it through the Pin step, where the write is committed", async () => {
		const user = userEvent.setup();
		renderField({
			value: branchedTree,
			settings: { blueprints: ["article"], pin_mode: "release" },
		});
		await screen.findByText("Content 1");

		const said = await openThroughStrip(1, 0);
		await user.click(await screen.findByText("Content 5"));
		await screen.findByTestId("reference-picker-pin-step");

		// The destination belongs to the whole add rather than to either half of
		// it, and step two is the last thing between the click and the write.
		expect(destination()).toBe(said);
	});

	it("says what will actually happen — the tree agrees with the sentence", async () => {
		const user = userEvent.setup();
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		const said = await openThroughStrip(1, 0);
		expect(said).toBe(
			"Insert as a sibling of Content 1, adopting 2 References",
		);
		await user.click(await screen.findByText("Content 5"));

		// Two References adopted, exactly as announced, and a sibling of
		// Content 1 rather than a child of it.
		expect(stored()).toEqual([
			{ id: "article-1" },
			{
				id: "article-5",
				children: [{ id: "article-2" }, { id: "article-3" }],
			},
			{ id: "article-4" },
		]);
	});

	it("counts a folded Reference as the one row it is on screen", async () => {
		const user = userEvent.setup();
		renderField({
			value: [
				{
					id: "article-1",
					children: [{ id: "article-2", children: [{ id: "article-3" }] }],
				},
			],
		});
		await user.click(
			await screen.findByRole("button", { name: "Collapse Content 2" }),
		);

		// Content 2 stands in for its whole branch, so a root arriving above it
		// adopts *one* Reference — the rule folding and dragging already agree
		// on, and the drawer must not quietly restate it as two.
		const said = await openThroughStrip(1, 0);
		expect(said).toBe("Insert as a sibling of Content 1, adopting 1 Reference");
		expect(destination()).toBe(said);

		await user.click(await screen.findByText("Content 5"));

		// One row was counted; the whole branch under it travelled.
		expect(stored()).toEqual([
			{ id: "article-1" },
			{
				id: "article-5",
				children: [{ id: "article-2", children: [{ id: "article-3" }] }],
			},
		]);
	});
});

describe("where the Add control's Reference will land", () => {
	it("says the append it performs rather than nothing", async () => {
		const user = userEvent.setup();
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		await openThroughAdd(user);

		// The Add control appends at the root, so it arrives beside the last
		// root — not beside the last *row*, which is one of Content 1's
		// children, and not with an empty line where a destination should be.
		expect(destination()).toBe("Insert as a sibling of Content 4");
	});

	it("reads as a root Reference arriving on an empty tree", async () => {
		const user = userEvent.setup();
		renderField({ value: [] });

		await openThroughAdd(user);

		// An empty tree has no gaps for strips and no root to sit beside, so the
		// Add control is the only way in and there is nothing to name.
		expect(destination()).toBe("Insert as a root Reference");
	});

	it("never claims an adoption, since an append has nothing below it", async () => {
		const user = userEvent.setup();
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		await openThroughAdd(user);

		expect(destination()).not.toMatch(/adopt/);
	});

	it("goes back to the append once a cancelled strip's drawer is reopened", async () => {
		const user = userEvent.setup();
		renderField({ value: branchedTree });
		await screen.findByText("Content 1");

		await openThroughStrip(1, 1);
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		await openThroughAdd(user);

		// A strip's destination belongs to that click and nothing else. Left
		// behind, it would tell the next Author their Reference is nesting under
		// Content 1 while the Add control appended it at the root.
		expect(destination()).toBe("Insert as a sibling of Content 4");
	});

	it("names the Content under its resolved name, as the rows do", async () => {
		const user = userEvent.setup();
		// A Reference to a Content the Adapter cannot resolve keeps its id on
		// screen; the line has to fall back the same way rather than say
		// "undefined".
		renderField({ value: [{ id: "deleted-42" }] });
		await screen.findByText("deleted-42");

		await openThroughAdd(user);

		expect(destination()).toBe("Insert as a sibling of deleted-42");
	});
});

describe("what the drawer leaves alone", () => {
	it("offers neither steps nor a destination in read-only mode", async () => {
		renderField({ value: branchedTree, readOnly: true });
		await screen.findByText("Content 1");

		// No Add control, no strips, and so no drawer to put chrome in.
		expect(
			screen.queryByRole("button", { name: "Add reference" }),
		).not.toBeInTheDocument();
		expect(screen.queryAllByTestId("reference-picker-step")).toHaveLength(0);
		expect(
			screen.queryByTestId("reference-picker-destination"),
		).not.toBeInTheDocument();
	});

	it("still says only that no adapter is configured, with no chrome", () => {
		renderField({ value: branchedTree, adapters: {} });

		expect(
			screen.getByText("Reference adapter not configured"),
		).toBeInTheDocument();
		expect(screen.queryAllByTestId("reference-picker-step")).toHaveLength(0);
		expect(
			screen.queryByTestId("reference-picker-destination"),
		).not.toBeInTheDocument();
	});
});
