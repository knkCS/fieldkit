// Row `_id`s through a real form (ADR-0023): legacy rows get ids minted into
// the form's defaults, so the form opens clean and the next save stores them;
// new rows get distinct ids.
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { FormProvider, useForm, useFormState } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { isRowId } from "../../../schema/row-ids";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const text = (accessor: string): Field => ({
	field_type: "text",
	config: {
		name: accessor,
		api_accessor: accessor,
		required: false,
		instructions: "",
	},
	system: false,
});

const authors: Field = {
	field_type: "group",
	config: {
		name: "Authors",
		api_accessor: "authors",
		required: false,
		instructions: "",
	},
	children: [text("name")],
	system: false,
};

const address: Field = {
	field_type: "fieldset",
	config: {
		name: "Address",
		api_accessor: "address",
		required: false,
		instructions: "",
	},
	children: [
		{
			...authors,
			config: {
				...authors.config,
				name: "Residents",
				api_accessor: "residents",
			},
		},
	],
	system: false,
};

const spec: Field[] = [text("title"), authors, address];

function Dirty() {
	const { isDirty } = useFormState();
	return <output data-testid="dirty">{String(isDirty)}</output>;
}

function Harness({
	onValid,
	defaults,
	later,
}: {
	onValid: (values: Record<string, unknown>) => void;
	defaults?: Record<string, unknown>;
	/** A record the Consumer `reset()`s the form with after mount, as one
	 * fetched asynchronously would be. */
	later?: Record<string, unknown>;
}) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
		defaultValues: defaults,
	});
	const { reset } = methods;
	useEffect(() => {
		if (later) reset(later);
	}, [later, reset]);
	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={builtInFieldTypes}>
					<form noValidate onSubmit={methods.handleSubmit(onValid)}>
						<SpecForm schema={spec} />
						<button type="submit">Save</button>
					</form>
					<Dirty />
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

const legacy = {
	title: "Book",
	authors: [{ name: "Ada" }, { name: "Grace" }],
	address: { residents: [{ name: "Edsger" }] },
};

async function submitted(onValid: ReturnType<typeof vi.fn>) {
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
	return onValid.mock.calls[0][0] as {
		authors: Record<string, unknown>[];
		address: { residents: Record<string, unknown>[] };
	};
}

function expectIds(values: Awaited<ReturnType<typeof submitted>>) {
	const ids = [
		...values.authors.map((row) => row._id),
		...values.address.residents.map((row) => row._id),
	];
	for (const id of ids) expect(isRowId(id)).toBe(true);
	expect(new Set(ids).size).toBe(ids.length);
	expect(values.authors.map((row) => row.name)).toEqual(["Ada", "Grace"]);
}

describe("SpecForm on rows stored without _id (ADR-0023)", () => {
	it("opens clean, and the next save stores the ids", async () => {
		const onValid = vi.fn();
		render(<Harness onValid={onValid} defaults={legacy} />);

		// The minting has happened (a row's id is in the submit below) and the
		// form is still not dirty.
		await waitFor(() =>
			expect(screen.getByTestId("dirty")).toHaveTextContent("false"),
		);
		expectIds(await submitted(onValid));
		expect(screen.getByTestId("dirty")).toHaveTextContent("false");
	});

	it("does the same for a record the Consumer resets the form with later", async () => {
		const onValid = vi.fn();
		render(<Harness onValid={onValid} later={legacy} />);

		await screen.findByDisplayValue("Book");
		await waitFor(() =>
			expect(screen.getByTestId("dirty")).toHaveTextContent("false"),
		);
		expectIds(await submitted(onValid));
		expect(screen.getByTestId("dirty")).toHaveTextContent("false");
	});

	it("gives each added row its own id", async () => {
		const onValid = vi.fn();
		render(
			<Harness
				onValid={onValid}
				defaults={{ authors: [], address: { residents: [] } }}
			/>,
		);

		const [addAuthor] = screen.getAllByRole("button", { name: "Add item" });
		fireEvent.click(addAuthor);
		fireEvent.click(addAuthor);

		const values = await submitted(onValid);
		expect(values.authors).toHaveLength(2);
		const [first, second] = values.authors.map((row) => row._id);
		expect(isRowId(first)).toBe(true);
		expect(isRowId(second)).toBe(true);
		expect(first).not.toBe(second);
	});
});
