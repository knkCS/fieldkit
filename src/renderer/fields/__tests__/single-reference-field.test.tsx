import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { SingleReferenceSettings } from "../../../schema/field-types/single-reference";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import {
	createFakeReferenceAdapter,
	type FakeReferenceAdapter,
} from "../../../test/fake-reference-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldComponent } from "../../field-component";
import { FieldKitProvider } from "../../provider";

const ACCESSOR = "primary_article";
const LABEL = "Primary article";

function makeField(
	overrides: {
		required?: boolean;
		settings?: SingleReferenceSettings | null;
	} = {},
): Field<SingleReferenceSettings> {
	return {
		field_type: "single_reference",
		config: {
			name: LABEL,
			api_accessor: ACCESSOR,
			required: overrides.required ?? false,
			instructions: "",
		},
		settings: overrides.settings ?? { blueprints: ["article"] },
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
	adapter,
	adapters,
	readOnly = false,
	onError,
}: {
	field?: Field<SingleReferenceSettings>;
	value?: unknown;
	adapter?: FakeReferenceAdapter;
	adapters?: FieldKitAdapters;
	readOnly?: boolean;
	onError?: (error: Error, fieldId: string) => void;
} = {}) {
	const submitted = vi.fn();
	const resolved =
		adapters ??
		({ reference: adapter ?? createFakeReferenceAdapter() } as const);

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
						<form onSubmit={methods.handleSubmit((data) => submitted(data))}>
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

describe("SingleReferenceField", () => {
	it("stores only the picked Content's id — never its name", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());
		await user.click(await screen.findByText("Cats of the world"));

		expect(stored()).toEqual({ id: "article-1" });
	});

	it("offers only Contents matching the Field's Blueprints", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.click(control());

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();
	});

	it("narrows the offered Contents to what the person searched for", async () => {
		const user = userEvent.setup();
		const { control } = renderField();

		await user.type(control(), "cat");

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(screen.getByText("Catalogues explained")).toBeInTheDocument();
		expect(screen.queryByText("Dogs of the world")).not.toBeInTheDocument();
	});

	it("shows the stored Content's current name, resolved on load", async () => {
		renderField({ value: { id: "article-2" } });

		expect(await screen.findByText("Dogs of the world")).toBeInTheDocument();
	});

	it("shows a Content renamed elsewhere under its new name", async () => {
		const adapter = createFakeReferenceAdapter();
		adapter.rename("article-2", "Dogs of the whole world");

		renderField({ value: { id: "article-2" }, adapter });

		expect(
			await screen.findByText("Dogs of the whole world"),
		).toBeInTheDocument();
	});

	it("still renders a Content it cannot resolve, showing its id", async () => {
		renderField({ value: { id: "deleted-42" } });

		expect(await screen.findByText("deleted-42")).toBeInTheDocument();
		// And the value is left exactly as it was — an unresolvable Content is
		// not silently dropped from the form data.
		expect(stored()).toEqual({ id: "deleted-42" });
	});

	it("still renders the stored Content when resolution fails", async () => {
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			failFetch: new Error("gateway down"),
		});

		renderField({ value: { id: "article-2" }, adapter, onError });

		expect(await screen.findByText("article-2")).toBeInTheDocument();
		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
		);
	});

	it("clears back to no Reference", async () => {
		const user = userEvent.setup();
		const { control } = renderField({ value: { id: "article-1" } });

		await screen.findByText("Cats of the world");
		await user.click(control());
		await user.keyboard("{Backspace}");

		expect(stored()).toBeNull();
	});

	it("replaces the stored Reference when another Content is picked", async () => {
		const user = userEvent.setup();
		const { control } = renderField({ value: { id: "article-1" } });

		await user.click(control());
		await user.click(await screen.findByText("Dogs of the world"));

		// One Reference or none — never an array.
		expect(stored()).toEqual({ id: "article-2" });
	});

	it("blocks submit and reports at its own path when required and empty", async () => {
		const user = userEvent.setup();
		const { submitted } = renderField({ field: makeField({ required: true }) });

		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(await screen.findByText(`${LABEL} is required`)).toBeInTheDocument();
		expect(submitted).not.toHaveBeenCalled();
	});

	it("submits once a required Field has a Reference", async () => {
		const user = userEvent.setup();
		const { submitted, control } = renderField({
			field: makeField({ required: true }),
		});

		await user.click(control());
		await user.click(await screen.findByText("Cats of the world"));
		await user.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() =>
			expect(submitted).toHaveBeenCalledWith({
				[ACCESSOR]: { id: "article-1" },
			}),
		);
	});

	it("says so when no reference adapter is configured", () => {
		renderField({ adapters: {} });

		expect(
			screen.getByText("Reference adapter not configured"),
		).toBeInTheDocument();
	});

	it("reports a failed search without losing the control", async () => {
		const user = userEvent.setup();
		const onError = vi.fn();
		const adapter = createFakeReferenceAdapter({
			failSearch: new Error("search exploded"),
		});
		const { control } = renderField({ adapter, onError });

		await user.type(control(), "cat");

		await waitFor(() =>
			expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
		);
		expect(control()).toBeInTheDocument();
	});

	it("cannot be changed in read-only mode", async () => {
		const { control } = renderField({
			value: { id: "article-1" },
			readOnly: true,
		});

		expect(await screen.findByText("Cats of the world")).toBeInTheDocument();
		expect(control()).toBeDisabled();
	});
});
