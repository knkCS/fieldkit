import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useFormState, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
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

const ACCESSOR = "related";

function attribute(
	fieldType: string,
	accessor: string,
	name: string,
	overrides: Partial<Field["config"]> = {},
	settings: unknown = null,
): Field {
	return {
		field_type: fieldType,
		config: {
			name,
			api_accessor: accessor,
			required: false,
			instructions: "",
			...overrides,
		},
		settings,
		children: null,
		system: false,
	};
}

const PAGE = attribute("text", "page", "Page");
const ROLE = attribute("text", "role", "Role", { required: true });

function makeField(attributes: Field[]): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: ACCESSOR,
			required: false,
			instructions: "",
		},
		settings: { blueprints: ["article"], attributes },
		children: null,
		system: false,
	};
}

/** The stored value, straight from the form — a drawer only worked if what it
 * wrote is what got stored, under the Reference it was opened on. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

/** The error the Schema reported for the first Reference's `role`, by path. */
function RoleError({ index = 0 }: { index?: number }) {
	const { errors } = useFormState();
	const forField = errors[ACCESSOR] as
		| Record<number, { attributes?: { role?: { message?: string } } }>
		| undefined;
	return (
		<output data-testid="role-error">
			{forField?.[index]?.attributes?.role?.message ?? ""}
		</output>
	);
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	attributes = [PAGE],
	value = [],
	readOnly = false,
}: {
	attributes?: Field[];
	value?: Reference[];
	readOnly?: boolean;
} = {}) {
	const field = makeField(attributes);
	const submitted = vi.fn();

	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={{
						reference: createFakeReferenceAdapter({
							contents: fakeCatalogue(6),
						}),
					}}
				>
					<FormProvider {...methods}>
						<form
							noValidate
							onSubmit={methods.handleSubmit((data) => submitted(data))}
						>
							<FieldComponent field={field} readOnly={readOnly} />
							<StoredValue />
							<RoleError />
							<button type="submit">Save</button>
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}

	return { ...render(<Harness />), submitted };
}

/** The count each row shows, top to bottom. */
function counts(): string[] {
	return screen
		.queryAllByTestId("reference-attribute-count")
		.map((el) => el.textContent ?? "");
}

/** Opens one Reference's Attributes by the Content's resolved name. */
async function openAttributes(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	await user.click(
		await screen.findByRole("button", {
			name: new RegExp(`^Attributes for ${name}`),
		}),
	);
	return await screen.findByTestId("reference-attributes-drawer");
}

async function closeDrawer(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Done" }));
}

describe("the Attributes drawer", () => {
	it("renders the Attribute Spec through the ordinary renderer", async () => {
		const user = userEvent.setup();
		renderField({
			attributes: [
				PAGE,
				attribute("number", "copies", "Copies"),
				attribute("boolean", "primary", "Primary"),
			],
			value: [{ id: "article-1" }],
		});
		await screen.findByText("Content 1");

		const drawer = await openAttributes(user, "Content 1");

		// Each Attribute brought its own label and its own control, because each
		// is an ordinary plugin rendered by the ordinary renderer.
		expect(within(drawer).getByText("Page")).toBeInTheDocument();
		expect(within(drawer).getByText("Copies")).toBeInTheDocument();
		expect(within(drawer).getByText("Primary")).toBeInTheDocument();
		// A number Attribute is a number control — nothing here has a case for
		// one; the `number` plugin does.
		expect(within(drawer).getByRole("spinbutton")).toBeInTheDocument();
		// And every one of them registers under the Reference it was opened on.
		expect(within(drawer).getByLabelText(/Page/)).toHaveAttribute(
			"name",
			"related.0.attributes.page",
		);
	});

	it("names the Content it was opened on", async () => {
		const user = userEvent.setup();
		renderField({ value: [{ id: "article-1" }, { id: "article-2" }] });
		await screen.findByText("Content 2");

		await openAttributes(user, "Content 2");

		// The drawer's own title, not the row's: someone filling in a page
		// number has to know whose page it is.
		expect(screen.getByRole("dialog")).toHaveTextContent("Content 2");
	});

	it("stores what was typed on that Reference, keyed by Accessor", async () => {
		const user = userEvent.setup();
		renderField({
			attributes: [PAGE, ROLE],
			value: [{ id: "article-1" }, { id: "article-2" }],
		});
		await screen.findByText("Content 2");

		const drawer = await openAttributes(user, "Content 2");
		await user.type(within(drawer).getByLabelText(/Page/), "12");

		// On the SECOND Reference, keyed by the Attribute's Accessor — never a
		// position, which is what knkCMS core aligns these by.
		expect(stored()).toEqual([
			{ id: "article-1" },
			{ id: "article-2", attributes: { page: "12" } },
		]);
	});

	it("stores a nested Reference's Attributes on the nested Reference", async () => {
		const user = userEvent.setup();
		renderField({
			value: [{ id: "article-1", children: [{ id: "article-2" }] }],
		});
		await screen.findByText("Content 2");

		const drawer = await openAttributes(user, "Content 2");
		await user.type(within(drawer).getByLabelText(/Page/), "7");

		expect(stored()).toEqual([
			{
				id: "article-1",
				children: [{ id: "article-2", attributes: { page: "7" } }],
			},
		]);
	});

	it("shows what a Reference already carries", async () => {
		const user = userEvent.setup();
		renderField({
			value: [{ id: "article-1", attributes: { page: "iv" } }],
		});
		await screen.findByText("Content 1");

		const drawer = await openAttributes(user, "Content 1");

		expect(within(drawer).getByLabelText(/Page/)).toHaveValue("iv");
	});

	it("opens read-only for a read-only Field", async () => {
		const user = userEvent.setup();
		renderField({
			value: [{ id: "article-1", attributes: { page: "iv" } }],
			readOnly: true,
		});
		await screen.findByText("Content 1");

		// Reading what a Reference says about the pointing is reading, so the
		// drawer opens — it just does not take an edit.
		const drawer = await openAttributes(user, "Content 1");
		expect(within(drawer).getByLabelText(/Page/)).toHaveAttribute("readonly");
	});

	it("offers nothing at all when the Field declares no Attributes", async () => {
		renderField({ attributes: [], value: [{ id: "article-1" }] });
		await screen.findByText("Content 1");

		// A count of nothing is noise, and a drawer with nothing in it is worse.
		expect(screen.queryByTestId("reference-attributes-button")).toBeNull();
	});
});

describe("the filled count on a row", () => {
	it("says how many of the declared Attributes a Reference has", async () => {
		renderField({
			attributes: [PAGE, ROLE],
			value: [
				{ id: "article-1", attributes: { page: "3", role: "editor" } },
				{ id: "article-2", attributes: { page: "" } },
				{ id: "article-3" },
			],
		});
		await screen.findByText("Content 1");

		expect(counts()).toEqual(["2/2", "0/2", "0/2"]);
	});

	it("goes up as an Attribute is filled in", async () => {
		const user = userEvent.setup();
		renderField({ attributes: [PAGE, ROLE], value: [{ id: "article-1" }] });
		await screen.findByText("Content 1");
		expect(counts()).toEqual(["0/2"]);

		const drawer = await openAttributes(user, "Content 1");
		await user.type(within(drawer).getByLabelText(/Page/), "3");
		await closeDrawer(user);

		expect(counts()).toEqual(["1/2"]);
	});
});

describe("a required Attribute", () => {
	it("blocks submit and reports under the Reference it belongs to", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({
			attributes: [PAGE, ROLE],
			value: [{ id: "article-1" }],
		});
		await screen.findByText("Content 1");

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(submitted).not.toHaveBeenCalled();
		// `related.0.attributes.role` — the path of the Reference that is
		// missing it, so a Consumer's error display lands on the right row.
		expect(screen.getByTestId("role-error").textContent).not.toBe("");
	});

	it("lets submit through once it is answered", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({
			attributes: [ROLE],
			value: [{ id: "article-1" }],
		});
		await screen.findByText("Content 1");

		const drawer = await openAttributes(user, "Content 1");
		await user.type(within(drawer).getByLabelText(/Role/), "author");
		await closeDrawer(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(submitted).toHaveBeenCalledWith({
			[ACCESSOR]: [{ id: "article-1", attributes: { role: "author" } }],
		});
	});
});

describe("Attributes and the shape of the tree", () => {
	/**
	 * jsdom lays nothing out, so a keyboard drag needs a faked column — the
	 * same one `reference-tree.test.tsx` fakes.
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

	async function keyboardDrag(name: string, ...codes: string[]) {
		const grip = screen.getByRole("button", { name: `Reorder ${name}` });
		grip.focus();
		fireEvent.keyDown(grip, { code: "Space" });
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		for (const code of codes) {
			await act(async () => {
				fireEvent.keyDown(document.activeElement ?? grip, { code });
			});
		}
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? grip, { code: "Space" });
		});
	}

	it("survives a reorder", async () => {
		const rects = mockRowRects();
		renderField({
			value: [
				{ id: "article-1", attributes: { page: "one" } },
				{ id: "article-2", attributes: { page: "two" } },
			],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");

		// The Attributes went with their Reference, not with the position.
		expect(stored()).toEqual([
			{ id: "article-2", attributes: { page: "two" } },
			{ id: "article-1", attributes: { page: "one" } },
		]);
		rects.mockRestore();
	});

	it("survives a reparent, branch and all", async () => {
		const rects = mockRowRects();
		renderField({
			value: [
				{ id: "article-1", attributes: { page: "one" } },
				{
					id: "article-2",
					attributes: { page: "two" },
					children: [{ id: "article-3", attributes: { page: "three" } }],
				},
			],
		});
		await screen.findByText("Content 1");

		// Content 1 nests under Content 2, which carries a branch of its own.
		await keyboardDrag("Content 1", "ArrowDown", "ArrowDown", "ArrowRight");

		expect(stored()).toEqual([
			{
				id: "article-2",
				attributes: { page: "two" },
				children: [
					{ id: "article-3", attributes: { page: "three" } },
					{ id: "article-1", attributes: { page: "one" } },
				],
			},
		]);
		rects.mockRestore();
	});

	it("still opens the right Reference's drawer after a reorder", async () => {
		const user = userEvent.setup();
		const rects = mockRowRects();
		renderField({
			value: [
				{ id: "article-1", attributes: { page: "one" } },
				{ id: "article-2", attributes: { page: "two" } },
			],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");
		rects.mockRestore();

		// Content 1 now sits at index 1, so its drawer has to address index 1 —
		// the count and the row are read from the same value the drawer writes.
		const drawer = await openAttributes(user, "Content 1");
		expect(within(drawer).getByLabelText(/Page/)).toHaveValue("one");
	});
});
