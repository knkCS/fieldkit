// A Reference's name links to its Content through the reference Adapter's
// optional `hrefFor` (ADR-0031): in read mode, in the form's Reference Tree and
// in Single Reference — and stays plain text wherever the Adapter does not
// answer. Driven through the public SpecForm with the fake Adapter, as the
// reference-read suites are.
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const page: Field = {
	field_type: "text",
	config: {
		name: "Page",
		api_accessor: "page",
		required: false,
		instructions: "",
	},
	settings: null,
	system: false,
};

const treeField: Field = {
	field_type: "reference",
	config: {
		name: "Related articles",
		api_accessor: "related",
		required: false,
		instructions: "",
	},
	settings: { blueprints: [{ blueprint: "article" }], spec: [page] },
	children: null,
	system: false,
};

const singleField: Field = {
	field_type: "single_reference",
	config: {
		name: "Primary article",
		api_accessor: "primary",
		required: false,
		instructions: "",
	},
	settings: { blueprints: ["article"] },
	children: null,
	system: false,
};

/** A tree with a branch, so a row carries every control a row can carry. */
const TREE = [
	{
		_id: "r1",
		id: "article-1",
		values: { page: "12" },
		children: [{ _id: "r2", id: "article-2", children: [] }],
	},
];

/** Addresses for article-1 and article-2; nothing for any other id. */
function hrefFor(id: string): string | undefined {
	return id.startsWith("article-") ? `/contents/${id}` : undefined;
}

function adapterWith(
	answer?: NonNullable<FieldKitAdapters["reference"]>["hrefFor"],
): FakeReferenceAdapter {
	const adapter = createFakeReferenceAdapter();
	return answer ? { ...adapter, hrefFor: answer } : adapter;
}

function renderRead(
	field: Field,
	values: Record<string, unknown>,
	adapter: FakeReferenceAdapter,
) {
	return render(
		<Provider>
			<FieldKitProvider
				plugins={builtInFieldTypes}
				adapters={{ reference: adapter }}
			>
				<SpecForm schema={[field]} mode="read" values={values} />
			</FieldKitProvider>
		</Provider>,
	);
}

function Stored({ accessor }: { accessor: string }) {
	const value = useWatch({ name: accessor });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderForm(
	field: Field,
	values: Record<string, unknown>,
	adapter: FakeReferenceAdapter,
) {
	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: values,
		});
		return (
			<Provider>
				<FormProvider {...methods}>
					<FieldKitProvider
						plugins={builtInFieldTypes}
						adapters={{ reference: adapter }}
					>
						<form noValidate>
							<SpecForm schema={[field]} />
						</form>
						<Stored accessor={field.config.api_accessor} />
					</FieldKitProvider>
				</FormProvider>
			</Provider>
		);
	}
	return render(<Harness />);
}

/**
 * jsdom lays nothing out, so dnd-kit's keyboard sensor finds no direction to
 * move in: fake a column of rows, one per 60px — as the tree's own drag tests
 * do.
 */
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

/** A drag from the keyboard: lift on the grip, press `codes`, release. */
async function keyboardDrag(name: string, ...codes: string[]) {
	const grip = screen.getByRole("button", { name: `Reorder ${name}` });
	grip.focus();
	fireEvent.keyDown(grip, { code: "Space" });
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	for (const code of [...codes, "Space"]) {
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? document.body, { code });
		});
	}
}

describe("Reference links — read mode", () => {
	it("links each name in the tree to the address hrefFor answers", async () => {
		renderRead(treeField, { related: TREE }, adapterWith(hrefFor));

		const cats = await screen.findByRole("link", { name: "Cats of the world" });
		expect(cats).toHaveAttribute("href", "/contents/article-1");
		const dogs = await screen.findByRole("link", { name: "Dogs of the world" });
		expect(dogs).toHaveAttribute("href", "/contents/article-2");
	});

	it("links a Single Reference's name", async () => {
		renderRead(
			singleField,
			{ primary: { id: "article-1" } },
			adapterWith(hrefFor),
		);

		const link = await screen.findByRole("link", { name: "Cats of the world" });
		expect(link).toHaveAttribute("href", "/contents/article-1");
	});

	it("links an unresolved Content by its id where hrefFor answers for it", async () => {
		renderRead(
			singleField,
			{ primary: { id: "article-404" } },
			adapterWith(hrefFor),
		);

		const link = await screen.findByRole("link", { name: "article-404" });
		expect(link).toHaveAttribute("href", "/contents/article-404");
	});

	it("renders plain text without hrefFor", async () => {
		renderRead(treeField, { related: TREE }, adapterWith());

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(await screen.findByText("Dogs of the world")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("renders plain text for an id hrefFor answers nothing for", async () => {
		renderRead(
			treeField,
			{
				related: [
					{ _id: "r1", id: "article-1" },
					{ _id: "r2", id: "author-1" },
				],
			},
			adapterWith(hrefFor),
		);

		expect(
			await screen.findByRole("link", { name: "Cats of the world" }),
		).toBeInTheDocument();
		expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Ada Lovelace" }),
		).not.toBeInTheDocument();
	});

	it("treats an empty address as no answer", async () => {
		renderRead(
			singleField,
			{ primary: { id: "article-1" } },
			adapterWith(() => ""),
		);

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});
});

describe("Reference links — the form", () => {
	it("links each name in the Reference Tree", async () => {
		renderForm(treeField, { related: TREE }, adapterWith(hrefFor));

		const cats = await screen.findByRole("link", { name: "Cats of the world" });
		expect(cats).toHaveAttribute("href", "/contents/article-1");
	});

	it("leaves the tree's names as text without hrefFor", async () => {
		renderForm(treeField, { related: TREE }, adapterWith());

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("keeps a row's own controls working beside the link", async () => {
		renderForm(treeField, { related: TREE }, adapterWith(hrefFor));
		const link = await screen.findByRole("link", { name: "Cats of the world" });
		const before = JSON.stringify(stored());

		// A click on the link is a navigation, and nothing on the row answers it.
		fireEvent.pointerDown(link);
		fireEvent.click(link);
		expect(JSON.stringify(stored())).toBe(before);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Collapse Cats of the world" }),
		).toBeInTheDocument();

		// The row's controls are still there, and still do what they did.
		expect(
			screen.getByRole("button", { name: "Reorder Cats of the world" }),
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: "Collapse Cats of the world" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("link", { name: "Dogs of the world" }),
			).not.toBeInTheDocument(),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Expand Cats of the world" }),
		);
		expect(
			await screen.findByRole("link", { name: "Dogs of the world" }),
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", { name: /^Values for Cats of the world/ }),
		);
		const drawer = await screen.findByRole("dialog");
		expect(within(drawer).getByDisplayValue("12")).toBeInTheDocument();
	});

	it("drags a linked row by its grip", async () => {
		const rects = mockRowRects();
		renderForm(
			treeField,
			{
				related: [
					{ _id: "r1", id: "article-1" },
					{ _id: "r2", id: "article-2" },
				],
			},
			adapterWith(hrefFor),
		);
		await screen.findByRole("link", { name: "Dogs of the world" });

		await keyboardDrag("Cats of the world", "ArrowDown");

		await waitFor(() =>
			expect(stored()).toEqual([
				{ _id: "r2", id: "article-2" },
				{ _id: "r1", id: "article-1" },
			]),
		);
		expect(
			screen
				.getAllByRole("link")
				.map((link) => [link.textContent, link.getAttribute("href")]),
		).toEqual([
			["Dogs of the world", "/contents/article-2"],
			["Cats of the world", "/contents/article-1"],
		]);
		rects.mockRestore();
	});

	it("removes a linked row with its Remove control", async () => {
		renderForm(treeField, { related: TREE }, adapterWith(hrefFor));
		await screen.findByRole("link", { name: "Dogs of the world" });

		fireEvent.click(
			screen.getByRole("button", { name: "Remove Dogs of the world" }),
		);

		await waitFor(() =>
			expect(
				screen.queryByRole("link", { name: "Dogs of the world" }),
			).not.toBeInTheDocument(),
		);
		expect(stored()).toEqual([
			{ _id: "r1", id: "article-1", values: { page: "12" } },
		]);
	});

	it("links a Single Reference's name", async () => {
		renderForm(
			singleField,
			{ primary: { id: "article-1" } },
			adapterWith(hrefFor),
		);

		const link = await screen.findByRole("link", { name: "Cats of the world" });
		expect(link).toHaveAttribute("href", "/contents/article-1");
	});

	it("adds nothing to a Single Reference without hrefFor", async () => {
		const adapter = adapterWith();
		renderForm(singleField, { primary: { id: "article-1" } }, adapter);

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(
			screen.queryByTestId("single-reference-name"),
		).not.toBeInTheDocument();
	});

	it("adds no link to an empty Single Reference", async () => {
		renderForm(singleField, { primary: null }, adapterWith(hrefFor));

		expect(await screen.findByText("Search content...")).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});
});
