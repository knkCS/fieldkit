import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { LookupSettings } from "../../../schema/field-types/lookup";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeLookupSource,
	FAKE_PRINTERS,
	type FakeLookupSource,
	fakeLookupCollection,
} from "../../../test/fake-lookup-source";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

const ACCESSOR = "stylesheet";
const LABEL = "Stylesheet";
const SOURCE = "layout:stylesheet";

function makeField(
	overrides: { required?: boolean; settings?: LookupSettings | null } = {},
): Field<LookupSettings> {
	return {
		field_type: "lookup",
		config: {
			name: LABEL,
			api_accessor: ACCESSOR,
			required: overrides.required ?? false,
			instructions: "",
		},
		settings:
			overrides.settings === undefined
				? { source: SOURCE }
				: overrides.settings,
		children: null,
		system: false,
	};
}

/** Reads the stored value straight from the form, so an assertion about what
 * was stored never goes through the same DOM the control renders. */
function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function renderField({
	field = makeField(),
	value = null,
	source,
	adapters,
	readOnly = false,
	onError,
}: {
	field?: Field<LookupSettings>;
	value?: unknown;
	source?: FakeLookupSource;
	adapters?: FieldKitAdapters;
	readOnly?: boolean;
	onError?: (error: Error, fieldId: string) => void;
} = {}) {
	const submitted = vi.fn();
	const resolved =
		adapters ??
		({
			lookup: { [SOURCE]: source ?? createFakeLookupSource() },
		} satisfies FieldKitAdapters);

	function Harness() {
		const methods = useForm({
			resolver: zodResolver(specToZodSchema([field], builtInFieldTypes)),
			defaultValues: { [ACCESSOR]: value },
		});
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider
					plugins={builtInFieldTypes}
					adapters={resolved}
					onError={onError}
				>
					<FormProvider {...methods}>
						{/* `noValidate`, as every Consumer's form must be — see the
						    Single Reference test for why. */}
						<form
							noValidate
							onSubmit={methods.handleSubmit((data) => submitted(data))}
						>
							<FieldComponent field={field} readOnly={readOnly} />
							<StoredValue />
							<button type="submit">Save</button>
						</form>
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}

	const view = render(<Harness />);
	// A regex, not the exact string: anker appends a required marker to the
	// label, so an exact match would find nothing on a required Field.
	return {
		...view,
		submitted,
		control: () => screen.getByLabelText(new RegExp(LABEL)),
	};
}

/** jsdom reports every box as 0×0; state the geometry the scroll implies. */
function setScrollGeometry(
	el: HTMLElement,
	geometry: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
	for (const [key, value] of Object.entries(geometry)) {
		Object.defineProperty(el, key, { value, configurable: true });
	}
}

describe("LookupField", () => {
	it("stores the picked item's id, as a bare string", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());
		await user.click(await screen.findByText("Boorberg print"));

		// A bare id, not `{ id }`: a Lookup carries nothing about the pointing,
		// so there is nothing for an object to hold (ADR-0015).
		expect(stored()).toBe("sheet-1");
	});

	it("consults the Source the Field names, not another that is registered", async () => {
		const user = userEvent.setup();
		const named = createFakeLookupSource();
		const other = createFakeLookupSource({ items: FAKE_PRINTERS });

		const { control } = renderField({
			adapters: { lookup: { [SOURCE]: named, "print:printer": other } },
		});

		await user.click(control());

		expect(await screen.findByText("Boorberg print")).toBeInTheDocument();
		expect(screen.queryByText("Metasystems OASYS")).not.toBeInTheDocument();
		expect(named.searches.length).toBeGreaterThan(0);
		expect(other.searches).toHaveLength(0);
	});

	it("shows the second line an item carries, so two can be told apart", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());

		// `description` is part of what a Source may answer with; a control that
		// accepted one and dropped it would describe something it does not do.
		expect(await screen.findByText("A4, two columns")).toBeInTheDocument();
		expect(screen.getByText("A4, wide margins")).toBeInTheDocument();
	});

	it("does not consult the Source until the menu opens", async () => {
		const source = createFakeLookupSource();
		renderField({ source });

		// The label is on screen, so the Field has mounted and rendered.
		expect(await screen.findByText(LABEL)).toBeInTheDocument();
		expect(source.searches).toHaveLength(0);
	});

	it("sends the typed query to the Source rather than filtering in the browser", async () => {
		const user = userEvent.setup();
		const source = createFakeLookupSource();
		const { control } = renderField({ source });

		await user.click(control());
		await user.type(control(), "screen");

		expect(await screen.findByText("Boorberg screen")).toBeInTheDocument();
		await waitFor(() => expect(source.searches.at(-1)?.query).toBe("screen"));
		expect(screen.queryByText("Boorberg print")).not.toBeInTheDocument();
	});

	it("asks the Source for the next page when the menu reaches the bottom", async () => {
		const user = userEvent.setup();
		const source = createFakeLookupSource({
			items: fakeLookupCollection(60),
		});
		const { control } = renderField({ source });

		await user.click(control());
		expect(await screen.findByText("Stylesheet 1")).toBeInTheDocument();
		expect(source.searches[0]).toMatchObject({ query: "", page: 1 });
		// The whole first page, and no more: the Source cut it, not the control.
		expect(screen.queryByText("Stylesheet 51")).not.toBeInTheDocument();

		const listbox = screen.getByRole("listbox");
		setScrollGeometry(listbox, {
			scrollTop: 300,
			scrollHeight: 400,
			clientHeight: 100,
		});
		fireEvent.scroll(listbox);

		// The second page is appended, not swapped in — page one is still there.
		expect(await screen.findByText("Stylesheet 51")).toBeInTheDocument();
		expect(screen.getByText("Stylesheet 1")).toBeInTheDocument();
		expect(source.searches[1]).toMatchObject({ query: "", page: 2 });

		// 60 of 60 are on screen, so there is no page three however far it
		// scrolls: the total said so.
		fireEvent.scroll(listbox);
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(source.searches).toHaveLength(2);
	});

	it("does not ask for a page past the end of an exactly-full one", async () => {
		const user = userEvent.setup();
		// Exactly one page: the boundary where an off-by-one asks for a page two
		// that does not exist, and the Source cannot say so because it is never
		// reached with a wrong offset — only the call count shows it.
		const source = createFakeLookupSource({
			items: fakeLookupCollection(50),
		});
		const { control } = renderField({ source });

		await user.click(control());
		expect(await screen.findByText("Stylesheet 50")).toBeInTheDocument();

		const listbox = screen.getByRole("listbox");
		setScrollGeometry(listbox, {
			scrollTop: 300,
			scrollHeight: 400,
			clientHeight: 100,
		});
		fireEvent.scroll(listbox);
		await new Promise((resolve) => setTimeout(resolve, 60));

		expect(source.searches).toHaveLength(1);
	});

	it("reads a stored id as its label, through the Source's resolver", async () => {
		const source = createFakeLookupSource();
		renderField({ source, value: "sheet-2" });

		expect(await screen.findByText("Boorberg screen")).toBeInTheDocument();
		expect(source.resolves).toEqual([["sheet-2"]]);
		// Reading a value is not searching: the menu never opened.
		expect(source.searches).toHaveLength(0);
	});

	it("reads a stored id as the id when the Source has no resolver", async () => {
		const source = createFakeLookupSource({ withoutResolve: true });
		renderField({ source, value: "sheet-2" });

		// Visibly degraded rather than blank — and the stored value is untouched.
		expect(await screen.findByText("sheet-2")).toBeInTheDocument();
		expect(stored()).toBe("sheet-2");
	});

	it("keeps a stored id on screen when the Source cannot resolve it", async () => {
		const source = createFakeLookupSource();
		renderField({ source, value: "sheet-gone" });

		expect(await screen.findByText("sheet-gone")).toBeInTheDocument();
		expect(stored()).toBe("sheet-gone");
	});

	it("stores null when the selection is cleared", async () => {
		const user = userEvent.setup();
		const { control } = renderField({ value: "sheet-1" });

		expect(await screen.findByText("Boorberg print")).toBeInTheDocument();
		await user.click(control());
		await user.keyboard("{Backspace}");

		expect(stored()).toBeNull();
	});

	it("blocks submit while a required Field is empty", async () => {
		const user = userEvent.setup();
		const { submitted, control } = renderField({
			field: makeField({ required: true }),
		});

		await user.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(submitted).not.toHaveBeenCalled());

		await user.click(control());
		await user.click(await screen.findByText("Boorberg print"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(submitted).toHaveBeenCalledWith({ [ACCESSOR]: "sheet-1" }),
		);
	});

	it("cannot be changed in read-only mode", async () => {
		const { control } = renderField({ value: "sheet-1", readOnly: true });

		// The label still resolves — reading is what read mode is for.
		expect(await screen.findByText("Boorberg print")).toBeInTheDocument();
		expect(control()).toBeDisabled();
	});

	it("says so, rather than throwing, when the named Source is not registered", async () => {
		renderField({
			adapters: { lookup: { "print:printer": createFakeLookupSource() } },
		});

		expect(await screen.findByText(/not registered/i)).toHaveTextContent(
			SOURCE,
		);
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	it("says so when no lookup adapter is configured at all", async () => {
		renderField({ adapters: {} });

		expect(await screen.findByText(/not registered/i)).toHaveTextContent(
			SOURCE,
		);
	});

	it("says so when the Field names no Source", async () => {
		renderField({ field: makeField({ settings: null }) });

		expect(await screen.findByText(/no lookup source/i)).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
	});

	it("reports a Source failure on the Consumer's error channel", async () => {
		const user = userEvent.setup();
		const onError = vi.fn();
		const source = createFakeLookupSource({
			failSearch: new Error("layout service is down"),
		});
		const { control } = renderField({ source, onError });

		await user.click(control());

		// The control stays alive and says what happened, and the Consumer hears
		// about it on its own channel.
		expect(await screen.findByRole("alert")).toBeInTheDocument();
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(
				expect.objectContaining({ message: "layout service is down" }),
				ACCESSOR,
			),
		);
	});
});
