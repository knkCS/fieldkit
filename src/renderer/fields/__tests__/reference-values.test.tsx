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

function specField(
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

const PAGE = specField("text", "page", "Page");
const ROLE = specField("text", "role", "Role", { required: true });

function makeField(referenceSpec: Field[]): Field<ReferenceSettings> {
	return {
		field_type: "reference",
		config: {
			name: "Related articles",
			api_accessor: ACCESSOR,
			required: false,
			instructions: "",
		},
		settings: {
			blueprints: [{ blueprint: "article" }],
			spec: referenceSpec,
		},
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
		| Record<number, { values?: { role?: { message?: string } } }>
		| undefined;
	return (
		<output data-testid="role-error">
			{forField?.[index]?.values?.role?.message ?? ""}
		</output>
	);
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	referenceSpec = [PAGE],
	value = [],
	readOnly = false,
}: {
	referenceSpec?: Field[];
	value?: Reference[];
	readOnly?: boolean;
} = {}) {
	const field = makeField(referenceSpec);
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
		.queryAllByTestId("reference-values-count")
		.map((el) => el.textContent ?? "");
}

/** Opens one Reference's values by the Content's resolved name. */
async function openValues(
	user: ReturnType<typeof userEvent.setup>,
	name: string,
) {
	await user.click(
		await screen.findByRole("button", {
			name: new RegExp(`^Values for ${name}`),
		}),
	);
	return await screen.findByTestId("reference-values-drawer");
}

async function closeDrawer(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Done" }));
}

describe("the values drawer", () => {
	it("renders the Reference Spec through the ordinary renderer", async () => {
		const user = userEvent.setup();
		renderField({
			referenceSpec: [
				PAGE,
				specField("number", "copies", "Copies"),
				specField("boolean", "primary", "Primary"),
			],
			value: [{ _id: "r1", id: "article-1" }],
		});
		await screen.findByText("Content 1");

		const drawer = await openValues(user, "Content 1");

		// Each Field brought its own label and its own control, because each
		// is an ordinary plugin rendered by the ordinary renderer.
		expect(within(drawer).getByText("Page")).toBeInTheDocument();
		expect(within(drawer).getByText("Copies")).toBeInTheDocument();
		expect(within(drawer).getByText("Primary")).toBeInTheDocument();
		// A number Field is a number control — nothing here has a case for
		// one; the `number` plugin does.
		expect(within(drawer).getByRole("spinbutton")).toBeInTheDocument();
		// And every one of them registers under the Reference it was opened on.
		expect(within(drawer).getByLabelText(/Page/)).toHaveAttribute(
			"name",
			"related.0.values.page",
		);
	});

	it("names the Content it was opened on", async () => {
		const user = userEvent.setup();
		renderField({
			value: [
				{ _id: "r1", id: "article-1" },
				{ _id: "r2", id: "article-2" },
			],
		});
		await screen.findByText("Content 2");

		await openValues(user, "Content 2");

		// The drawer's own title, not the row's: someone filling in a page
		// number has to know whose page it is.
		expect(screen.getByRole("dialog")).toHaveTextContent("Content 2");
	});

	it("stores what was typed on that Reference, keyed by Accessor", async () => {
		const user = userEvent.setup();
		renderField({
			referenceSpec: [PAGE, ROLE],
			value: [
				{ _id: "r1", id: "article-1" },
				{ _id: "r2", id: "article-2" },
			],
		});
		await screen.findByText("Content 2");

		const drawer = await openValues(user, "Content 2");
		await user.type(within(drawer).getByLabelText(/Page/), "12");

		// On the SECOND Reference, keyed by the Field's Accessor — never a
		// position, which is what knkCMS core aligns these by.
		expect(stored()).toEqual([
			{ _id: "r1", id: "article-1" },
			{ _id: "r2", id: "article-2", values: { page: "12" } },
		]);
	});

	it("stores a nested Reference's values on the nested Reference", async () => {
		const user = userEvent.setup();
		renderField({
			value: [
				{
					_id: "r1",
					id: "article-1",
					children: [{ _id: "r2", id: "article-2" }],
				},
			],
		});
		await screen.findByText("Content 2");

		const drawer = await openValues(user, "Content 2");
		await user.type(within(drawer).getByLabelText(/Page/), "7");

		expect(stored()).toEqual([
			{
				_id: "r1",
				id: "article-1",
				children: [{ _id: "r2", id: "article-2", values: { page: "7" } }],
			},
		]);
	});

	it("shows what a Reference already carries", async () => {
		const user = userEvent.setup();
		renderField({
			value: [{ _id: "r1", id: "article-1", values: { page: "iv" } }],
		});
		await screen.findByText("Content 1");

		const drawer = await openValues(user, "Content 1");

		expect(within(drawer).getByLabelText(/Page/)).toHaveValue("iv");
	});

	it("opens read-only for a read-only Field", async () => {
		const user = userEvent.setup();
		renderField({
			value: [{ _id: "r1", id: "article-1", values: { page: "iv" } }],
			readOnly: true,
		});
		await screen.findByText("Content 1");

		// Reading what a Reference says about the pointing is reading, so the
		// drawer opens — it just does not take an edit.
		const drawer = await openValues(user, "Content 1");
		expect(within(drawer).getByLabelText(/Page/)).toHaveAttribute("readonly");
	});

	it("offers nothing at all when the Reference Spec is empty", async () => {
		renderField({
			referenceSpec: [],
			value: [{ _id: "r1", id: "article-1" }],
		});
		await screen.findByText("Content 1");

		// A count of nothing is noise, and a drawer with nothing in it is worse.
		expect(screen.queryByTestId("reference-values-button")).toBeNull();
	});
});

describe("the filled count on a row", () => {
	it("says how many of the Reference Spec's Fields a Reference has filled", async () => {
		renderField({
			referenceSpec: [PAGE, ROLE],
			value: [
				{
					_id: "r1",
					id: "article-1",
					values: { page: "3", role: "editor" },
				},
				{ _id: "r2", id: "article-2", values: { page: "" } },
				{ _id: "r3", id: "article-3" },
			],
		});
		await screen.findByText("Content 1");

		expect(counts()).toEqual(["2/2", "0/2", "0/2"]);
	});

	it("goes up as a value is filled in", async () => {
		const user = userEvent.setup();
		renderField({
			referenceSpec: [PAGE, ROLE],
			value: [{ _id: "r1", id: "article-1" }],
		});
		await screen.findByText("Content 1");
		expect(counts()).toEqual(["0/2"]);

		const drawer = await openValues(user, "Content 1");
		await user.type(within(drawer).getByLabelText(/Page/), "3");
		await closeDrawer(user);

		expect(counts()).toEqual(["1/2"]);
	});
});

describe("a required Reference Spec Field", () => {
	it("blocks submit and reports under the Reference it belongs to", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({
			referenceSpec: [PAGE, ROLE],
			value: [{ _id: "r1", id: "article-1" }],
		});
		await screen.findByText("Content 1");

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(submitted).not.toHaveBeenCalled();
		// `related.0.values.role` — the path of the Reference that is
		// missing it, so a Consumer's error display lands on the right row.
		expect(screen.getByTestId("role-error").textContent).not.toBe("");
	});

	it("lets submit through once it is answered", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({
			referenceSpec: [ROLE],
			value: [{ _id: "r1", id: "article-1" }],
		});
		await screen.findByText("Content 1");

		const drawer = await openValues(user, "Content 1");
		await user.type(within(drawer).getByLabelText(/Role/), "author");
		await closeDrawer(user);
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(submitted).toHaveBeenCalledWith({
			[ACCESSOR]: [{ _id: "r1", id: "article-1", values: { role: "author" } }],
		});
	});
});

describe("values and the shape of the tree", () => {
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
				{ _id: "r1", id: "article-1", values: { page: "one" } },
				{ _id: "r2", id: "article-2", values: { page: "two" } },
			],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");

		// The values went with their Reference, not with the position.
		expect(stored()).toEqual([
			{ _id: "r2", id: "article-2", values: { page: "two" } },
			{ _id: "r1", id: "article-1", values: { page: "one" } },
		]);
		rects.mockRestore();
	});

	it("survives a reparent, branch and all", async () => {
		const rects = mockRowRects();
		renderField({
			value: [
				{ _id: "r1", id: "article-1", values: { page: "one" } },
				{
					_id: "r2",
					id: "article-2",
					values: { page: "two" },
					children: [{ _id: "r3", id: "article-3", values: { page: "three" } }],
				},
			],
		});
		await screen.findByText("Content 1");

		// Content 1 nests under Content 2, which carries a branch of its own.
		await keyboardDrag("Content 1", "ArrowDown", "ArrowDown", "ArrowRight");

		expect(stored()).toEqual([
			{
				_id: "r2",
				id: "article-2",
				values: { page: "two" },
				children: [
					{ _id: "r3", id: "article-3", values: { page: "three" } },
					{ _id: "r1", id: "article-1", values: { page: "one" } },
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
				{ _id: "r1", id: "article-1", values: { page: "one" } },
				{ _id: "r2", id: "article-2", values: { page: "two" } },
			],
		});
		await screen.findByText("Content 1");

		await keyboardDrag("Content 1", "ArrowDown");
		rects.mockRestore();

		// Content 1 now sits at index 1, so its drawer has to address index 1 —
		// the count and the row are read from the same value the drawer writes.
		const drawer = await openValues(user, "Content 1");
		expect(within(drawer).getByLabelText(/Page/)).toHaveValue("one");
	});
});
