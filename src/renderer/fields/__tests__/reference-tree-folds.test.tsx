// src/renderer/fields/__tests__/reference-tree-folds.test.tsx
/**
 * What a drag does to the tree's *folding* — the tree drag-feedback spec's
 * Decisions 7–9 (2026-08-05): the dragged branch folds away for the duration,
 * a folded Reference rested on springs open, and a spring is a preview until
 * the drop commits.
 *
 * **A file of its own because it drives real pointer drags.** jsdom ships no
 * `PointerEvent`, so dnd-kit's `PointerSensor` — which activates on
 * `onPointerDown` and reads `isPrimary` off the native event — can never fire
 * in it. A four-line subclass of `MouseEvent` is the whole of what is missing,
 * and with it the spring's dwell (a pointer-only device, spring-loaded sections
 * spec Decision 6) becomes assertable through the rendered output rather than
 * only through its hook. Defining `PointerEvent` is a global change, though,
 * and anker's zag-based components branch on it — so it lives here, in the one
 * file that needs it, rather than in `src/test/setup.ts`.
 *
 * The other reason this file matters: Decisions 7 and 8 unmount rows at drag
 * start and mount them mid-drag, so the geometry a drag collides against has to
 * follow. Two tests carry that. "Leaves a sprung branch open when the drop lands
 * inside it" resolves a drop onto a row that **did not exist at the lift**,
 * which no cached rect could describe; and the last test here commits a drop
 * with **no rect stub at all**, which proves a drag survives losing rows
 * mid-flight with nothing propping it up. Each says what it can and cannot see,
 * in place.
 */
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { ReferenceSettings } from "../../../schema/field-types/reference";
import type { Reference } from "../../../schema/reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	fakeCatalogue,
} from "../../../test/fake-reference-adapter";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";
import { SPRING_DWELL_MS } from "../use-spring-loaded-branch";

/**
 * The whole of what jsdom is missing for a `PointerSensor` drag: a
 * `PointerEvent` that is a `MouseEvent` with `isPrimary` on it. dnd-kit reads
 * `isPrimary`, `button` and `clientX`/`clientY`, all of which this carries.
 */
class TestPointerEvent extends MouseEvent {
	isPrimary: boolean;
	pointerId: number;
	pointerType: string;
	constructor(type: string, init: PointerEventInit = {}) {
		super(type, init);
		this.isPrimary = init.isPrimary ?? true;
		this.pointerId = init.pointerId ?? 1;
		this.pointerType = init.pointerType ?? "mouse";
	}
}
(globalThis as unknown as { PointerEvent: unknown }).PointerEvent =
	TestPointerEvent;

const ACCESSOR = "related";

const field: Field<ReferenceSettings> = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: ACCESSOR,
		required: false,
		instructions: "",
	},
	settings: { blueprints: ["article"] },
	children: null,
	system: false,
};

function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderTree(value: Reference[], settings?: ReferenceSettings) {
	const capped: Field<ReferenceSettings> = {
		...field,
		settings: { ...field.settings, ...settings },
	};
	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([capped], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={{
						reference: createFakeReferenceAdapter({
							contents: fakeCatalogue(8),
						}),
					}}
				>
					<FormProvider {...methods}>
						<form noValidate>
							<FieldComponent field={capped} />
							<StoredValue />
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Harness />);
}

/** The rows on screen, top to bottom, as `[name, depth]`. */
function renderedRows(): [string, number][] {
	return screen
		.queryAllByTestId("reference-row")
		.map((row) => [
			row.textContent?.trim() ?? "",
			Number(row.getAttribute("data-depth")),
		]);
}

/** Whether the named Reference currently shows an expanded branch. */
function isExpanded(name: string): boolean {
	return (
		screen
			.getByRole("button", {
				name: new RegExp(`^(Collapse|Expand) ${name}$`),
			})
			.getAttribute("aria-expanded") === "true"
	);
}

/** Folds a branch the way an Author does, before any drag starts. */
async function collapseBranch(name: string) {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name: `Collapse ${name}` }));
	});
}

/** jsdom lays nothing out — see the note on `mockRowRects` in
 * `reference-tree.test.tsx`. One row per 60px, read off the live DOM so that a
 * fold or a spring moves the rows it should. */
function mockRowRects() {
	return vi
		.spyOn(Element.prototype, "getBoundingClientRect")
		.mockImplementation(function (this: Element) {
			const rows = Array.from(
				document.querySelectorAll('[data-testid="reference-row"]'),
			);
			const index = rows.indexOf(this);
			const top = index === -1 ? 0 : index * 60;
			return {
				top,
				bottom: top + 50,
				left: 0,
				right: 200,
				width: 200,
				height: 50,
				x: 0,
				y: top,
				toJSON() {
					return this;
				},
			} as DOMRect;
		});
}

/** Lifts a row from the keyboard and leaves the drag in flight. */
async function liftWithKeyboard(name: string) {
	const grip = screen.getByRole("button", { name: `Reorder ${name}` });
	grip.focus();
	fireEvent.keyDown(grip, { code: "Space" });
	// The KeyboardSensor attaches its document listener in a setTimeout after
	// activation — yield a macrotask before the first key, by whichever clock
	// the test is running on.
	await act(async () => {
		if (vi.isFakeTimers()) {
			await vi.advanceTimersByTimeAsync(0);
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function pressDuringDrag(code: string) {
	await act(async () => {
		fireEvent.keyDown(document.activeElement ?? document.body, { code });
	});
}

/** Lifts a row with the pointer. The drag is not active until it has moved
 * past the 8px activation constraint. */
async function pointerLift(name: string) {
	const grip = screen.getByRole("button", { name: `Reorder ${name}` });
	await act(async () => {
		fireEvent.pointerDown(grip, {
			isPrimary: true,
			button: 0,
			clientX: 0,
			clientY: 0,
		});
	});
}

/** Moves the pointer to an offset from where the lift happened. */
async function pointerMoveTo(x: number, y: number) {
	await act(async () => {
		fireEvent.pointerMove(document, { clientX: x, clientY: y });
	});
}

async function pointerDrop() {
	await act(async () => {
		fireEvent.pointerUp(document, { clientX: 0, clientY: 0 });
	});
}

/**
 * Puts down whatever drag is still in flight, and waits out the sensor's own
 * teardown.
 *
 * A `PointerSensor` holds a **capture-phase click blocker on `document`** for
 * the length of a drag, and lets go of it 50ms after it detaches. A test that
 * ends with a drag still running therefore leaves that blocker in place, where
 * it swallows the *next* test's clicks before React ever sees them — a fold
 * that silently never happens, and an hour of reading the wrong code. Every
 * test here ends through this.
 */
async function settleDrag() {
	await act(async () => {
		fireEvent.pointerUp(document, { clientX: 0, clientY: 0 });
	});
	if (vi.isFakeTimers()) {
		await act(async () => {
			vi.advanceTimersByTime(100);
		});
	}
}

/** Lets a dwell elapse while the drag stays in flight. */
async function dwell(ms = SPRING_DWELL_MS) {
	await act(async () => {
		vi.advanceTimersByTime(ms);
	});
}

describe("the dragged Reference's own branch folds away (Decision 7)", () => {
	let rects: ReturnType<typeof mockRowRects>;
	beforeEach(() => {
		rects = mockRowRects();
	});
	afterEach(() => {
		rects.mockRestore();
	});

	// Content 1 > Content 2 > Content 3, then Content 4 > Content 5.
	const twoBranches: Reference[] = [
		{
			id: "article-1",
			children: [{ id: "article-2", children: [{ id: "article-3" }] }],
		},
		{ id: "article-4", children: [{ id: "article-5" }] },
	];

	it("takes the dragged branch's descendants off screen for the drag", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");

		await liftWithKeyboard("Content 1");

		// Every row left is a row a release could land against: a drop inside
		// your own branch has been impossible since #65, and this is the tree
		// finally saying so.
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 4", 0],
			["Content 5", 1],
		]);
		await pressDuringDrag("Escape");
	});

	it("touches no other Reference's fold on lift", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");

		await liftWithKeyboard("Content 1");

		// Content 4 was expanded before the lift and stays expanded: only the
		// branch that provably cannot be aimed into folds.
		expect(isExpanded("Content 4")).toBe(true);
		expect(isExpanded("Content 1")).toBe(false);
		await pressDuringDrag("Escape");
	});

	it("puts the fold back where it was once the drop lands", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");

		// Two rows down clears Content 4's whole branch, which is where a root
		// has to land to stay a root.
		await liftWithKeyboard("Content 1");
		await pressDuringDrag("ArrowDown");
		await pressDuringDrag("ArrowDown");
		await pressDuringDrag("Space");

		expect(stored()).toEqual([
			{ id: "article-4", children: [{ id: "article-5" }] },
			{
				id: "article-1",
				children: [{ id: "article-2", children: [{ id: "article-3" }] }],
			},
		]);
		// Expanded again, and at its new keys: the restore has to survive the
		// re-keying a move performs.
		expect(renderedRows()).toEqual([
			["Content 4", 0],
			["Content 5", 1],
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 2],
		]);
	});

	it("puts the fold back when the drag is cancelled", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");

		await liftWithKeyboard("Content 1");
		await pressDuringDrag("ArrowDown");
		expect(renderedRows()).toHaveLength(3);

		await pressDuringDrag("Escape");

		expect(stored()).toEqual(twoBranches);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 2],
			["Content 4", 0],
			["Content 5", 1],
		]);
	});

	it("leaves a branch that was already folded folded after the drop", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");
		await collapseBranch("Content 1");

		await liftWithKeyboard("Content 1");
		await pressDuringDrag("ArrowDown");
		await pressDuringDrag("ArrowDown");
		await pressDuringDrag("Space");

		expect(renderedRows()).toEqual([
			["Content 4", 0],
			["Content 5", 1],
			["Content 1", 0],
		]);
		expect(isExpanded("Content 1")).toBe(false);
	});

	it("restores every fold to its state at lift when Escape cancels (Decision 9)", async () => {
		renderTree(twoBranches);
		await screen.findByText("Content 1");
		// One folded, one open — the state the cancel has to reproduce exactly.
		await collapseBranch("Content 4");

		await liftWithKeyboard("Content 1");
		await pressDuringDrag("ArrowDown");
		await pressDuringDrag("Escape");

		expect(isExpanded("Content 1")).toBe(true);
		expect(isExpanded("Content 4")).toBe(false);
		expect(stored()).toEqual(twoBranches);
	});

	it("still refuses a depth its folded-away branch cannot afford", async () => {
		// Two levels allowed, and the dragged branch already uses both.
		renderTree(
			[
				{ id: "article-1" },
				{ id: "article-2", children: [{ id: "article-3" }] },
			],
			{ blueprints: ["article"], max_depth: 2 },
		);
		await screen.findByText("Content 1");

		// `height` is measured by `flattenReferences` over the *tree*, never over
		// what is on screen, so folding the dragged branch cannot buy it a level
		// it could not otherwise have had. knkCMS core reads the visible list and
		// has exactly this bug (`docs/core-reference-tree-comparison.md` §5.2).
		await liftWithKeyboard("Content 2");
		await pressDuringDrag("ArrowRight");
		await pressDuringDrag("Space");

		expect(stored()).toEqual([
			{ id: "article-1" },
			{ id: "article-2", children: [{ id: "article-3" }] },
		]);
	});
});

describe("resting on a folded Reference springs it open (Decision 8)", () => {
	let rects: ReturnType<typeof mockRowRects>;
	beforeEach(() => {
		rects = mockRowRects();
	});
	afterEach(async () => {
		// Before RTL unmounts anything: a drag left in flight keeps the sensor's
		// click blocker on `document` (see `settleDrag`).
		await settleDrag();
		vi.useRealTimers();
		rects.mockRestore();
	});

	// Content 1 > Content 2, then Content 3 — folded, Content 1 stands in for
	// its whole branch and Content 3 is the row below it.
	const nested: Reference[] = [
		{ id: "article-1", children: [{ id: "article-2" }] },
		{ id: "article-3" },
	];

	async function liftContent3OverFoldedContent1() {
		await collapseBranch("Content 1");
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		await pointerLift("Content 3");
		// Past the 8px activation constraint, then up one row height so the drag
		// rests on Content 1.
		await pointerMoveTo(0, -30);
		await pointerMoveTo(0, -60);
	}

	it("expands the branch once the dwell elapses", async () => {
		renderTree(nested);
		await screen.findByText("Content 1");
		await liftContent3OverFoldedContent1();

		expect(renderedRows().map(([name]) => name)).toEqual([
			"Content 1",
			"Content 3",
		]);

		await dwell();

		// The slot inside Content 1 is now something an Author can aim at.
		expect(renderedRows().map(([name]) => name)).toEqual([
			"Content 1",
			"Content 2",
			"Content 3",
		]);
	});

	it("does not spring for a drag that crosses it quickly", async () => {
		renderTree(nested);
		await screen.findByText("Content 1");
		await liftContent3OverFoldedContent1();

		await dwell(SPRING_DWELL_MS - 50);
		// Back off Content 1 before the dwell is up, then wait far longer than
		// one: leaving re-arms nothing, so the branch stays folded.
		await pointerMoveTo(0, 0);
		await dwell(SPRING_DWELL_MS * 2);

		expect(renderedRows().map(([name]) => name)).toEqual([
			"Content 1",
			"Content 3",
		]);
	});

	it("folds a sprung branch back when it does not receive the drop", async () => {
		renderTree(nested);
		await screen.findByText("Content 1");
		await liftContent3OverFoldedContent1();
		await dwell();

		// Released at Content 1's own level, so the branch lands *beside* it.
		await pointerDrop();

		expect(stored()).toEqual([
			{ id: "article-3" },
			{ id: "article-1", children: [{ id: "article-2" }] },
		]);
		// A spring is a preview: Content 1 never received the drop, so it is
		// folded again.
		expect(renderedRows()).toEqual([
			["Content 3", 0],
			["Content 1", 0],
		]);
	});

	it("leaves a sprung branch open when the drop lands inside it", async () => {
		renderTree(nested);
		await screen.findByText("Content 1");
		await liftContent3OverFoldedContent1();
		await dwell();

		// Back down onto Content 2 and one indent in: the drop lands inside the
		// branch that sprang, which is #65's unfold-on-arrival rule.
		//
		// **This is the geometry test.** Content 2 did not exist when the drag
		// began — it mounted when the branch sprang — so a drag that went on
		// colliding against the rects it measured at the lift could not resolve
		// onto it at all, and the drop would land somewhere else entirely. That
		// mid-drag re-measure is the whole risk this amendment carries.
		await pointerMoveTo(24, 0);
		await pointerDrop();

		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-3" }, { id: "article-2" }],
			},
		]);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 3", 1],
			["Content 2", 1],
		]);
	});

	it("restores a sprung fold when Escape cancels the drag", async () => {
		renderTree(nested);
		await screen.findByText("Content 1");
		await liftContent3OverFoldedContent1();
		await dwell();
		expect(renderedRows()).toHaveLength(3);

		await act(async () => {
			fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
		});

		expect(stored()).toEqual(nested);
		expect(isExpanded("Content 1")).toBe(false);
	});
});

describe("a keyboard drag has no dwell, and needs none", () => {
	let rects: ReturnType<typeof mockRowRects>;
	beforeEach(() => {
		rects = mockRowRects();
	});
	afterEach(() => {
		vi.useRealTimers();
		rects.mockRestore();
	});

	it("never springs, and still drops into a folded branch at its end", async () => {
		renderTree([
			{ id: "article-3" },
			{ id: "article-1", children: [{ id: "article-2" }] },
			{ id: "article-4" },
		]);
		await screen.findByText("Content 1");
		await collapseBranch("Content 1");
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

		await liftWithKeyboard("Content 3");
		await pressDuringDrag("ArrowDown");
		// Standing on the folded Reference for far longer than a pointer would
		// need: a keyboard drag has no dwell, so nothing springs.
		await act(async () => {
			vi.advanceTimersByTime(SPRING_DWELL_MS * 4);
		});
		expect(renderedRows().map(([name]) => name)).toEqual([
			"Content 3",
			"Content 1",
			"Content 4",
		]);

		await pressDuringDrag("ArrowRight");
		await pressDuringDrag("Space");

		// And it needs none: the drop lands at the end of the folded branch and
		// unfolds it, which is what #65 already did.
		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-2" }, { id: "article-3" }],
			},
			{ id: "article-4" },
		]);
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 1],
			["Content 3", 1],
			["Content 4", 0],
		]);
	});
});

describe("with nothing faking the layout at all", () => {
	it("commits a drop of a folded-away branch against the real DOM", async () => {
		// No `mockRowRects` here, and no other fake either: a real pointer lift,
		// a real unmount of the dragged branch under it, and a real drop, read
		// against whatever geometry jsdom actually has.
		//
		// **Be honest about what that is.** jsdom lays nothing out, so every rect
		// is 0×0 and `closestCenter` resolves by registration order rather than
		// by distance — this cannot tell a stale rect from a fresh one, because
		// there is no geometry for either to describe. What it does prove is that
		// a drag survives losing rows mid-flight with nothing propping it up:
		// the branch leaves the DOM between the lift and the drop, and the
		// release still resolves, commits, and puts the fold back. The test that
		// pins *geometry* across a shape change is the sprung-drop one above,
		// where the row the drop lands on did not exist at the lift.
		renderTree([
			{ id: "article-1" },
			{ id: "article-2", children: [{ id: "article-3" }] },
		]);
		await screen.findByText("Content 1");

		await pointerLift("Content 2");
		await pointerMoveTo(0, -30);
		// Content 2's branch is folded away by the lift, so only Content 1 and
		// Content 2 are mounted to collide with.
		expect(renderedRows()).toEqual([
			["Content 1", 0],
			["Content 2", 0],
		]);

		await pointerDrop();

		expect(stored()).toEqual([
			{ id: "article-2", children: [{ id: "article-3" }] },
			{ id: "article-1" },
		]);
		// And the branch is back, whole and expanded, under its new key.
		expect(renderedRows()).toEqual([
			["Content 2", 0],
			["Content 3", 1],
			["Content 1", 0],
		]);
	});
});
