// A Consumer that holds its form above a router outlet (#331): the form is
// seeded before SpecForm mounts, and may be saved without SpecForm ever
// mounting. Seeded through formDefaults(), stored rows without `_id`s pass a
// Save and the form is clean on load — MintRowIds is not needed for either.
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { FormProvider, useForm, useFormState } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { formDefaults } from "../../../schema/form-defaults";
import { isRowId } from "../../../schema/row-ids";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const field = (
	field_type: string,
	api_accessor: string,
	extra: Partial<Field> = {},
): Field => ({
	field_type,
	config: {
		name: api_accessor,
		api_accessor,
		required: false,
		instructions: "",
	},
	system: false,
	...extra,
});

const spec: Field[] = [
	field("text", "title"),
	field("group", "authors", { children: [field("text", "name")] }),
	field("fieldset", "address", {
		children: [
			field("group", "residents", { children: [field("text", "name")] }),
		],
	}),
];

const stored = {
	title: "Book",
	authors: [{ name: "Ada" }, { name: "Grace" }],
	address: { residents: [{ name: "Edsger" }] },
};

function Dirty() {
	const { isDirty } = useFormState();
	return <output data-testid="dirty">{String(isDirty)}</output>;
}

/** The form lives above a toggle; the toggle, standing in for a router
 * outlet, starts on a view that is not SpecForm and is never switched. */
function Consumer({
	defaultValues,
	onValid,
	onInvalid,
}: {
	defaultValues: Record<string, unknown>;
	onValid: (values: Record<string, unknown>) => void;
	onInvalid?: () => void;
}) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
		defaultValues,
	});
	const [editing] = useState(false);
	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={builtInFieldTypes}>
					<form noValidate onSubmit={methods.handleSubmit(onValid, onInvalid)}>
						{editing ? <SpecForm schema={spec} /> : <p>Overview</p>}
						<button type="submit">Save</button>
					</form>
					<Dirty />
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

describe("a form seeded through formDefaults, SpecForm never mounted", () => {
	it("is clean on load and passes a Save with ids in every row", async () => {
		const onValid = vi.fn();
		render(
			<Consumer
				defaultValues={formDefaults(spec, stored, builtInFieldTypes)}
				onValid={onValid}
			/>,
		);
		expect(screen.getByTestId("dirty").textContent).toBe("false");

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
		const values = onValid.mock.calls[0][0] as {
			authors: Record<string, unknown>[];
			address: { residents: Record<string, unknown>[] };
		};
		const ids = [
			...values.authors.map((row) => row._id),
			...values.address.residents.map((row) => row._id),
		];
		expect(ids).toHaveLength(3);
		for (const id of ids) expect(isRowId(id)).toBe(true);
		expect(new Set(ids).size).toBe(3);
		expect(screen.getByTestId("dirty").textContent).toBe("false");
	});

	it("fails the same Save when seeded with the raw stored value", async () => {
		// Why the seeding matters: without SpecForm's MintRowIds, nothing
		// else mints the missing ids before validation.
		const onValid = vi.fn();
		const onInvalid = vi.fn();
		render(
			<Consumer
				defaultValues={stored}
				onValid={onValid}
				onInvalid={onInvalid}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onInvalid).toHaveBeenCalledTimes(1));
		expect(onValid).not.toHaveBeenCalled();
	});
});
