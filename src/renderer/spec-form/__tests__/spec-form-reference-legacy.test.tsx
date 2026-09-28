// Legacy Reference values through a real form (ADR-0008, amended; ADR-0023):
// `attributes`, a `version`-era Pin, a stored label and a missing `_id` are
// normalised into the form's defaults, so the form opens clean and the next
// save stores the new shape.
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm, useFormState } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { isRowId } from "../../../schema/row-ids";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const page: Field = {
	field_type: "number",
	config: {
		name: "Page",
		api_accessor: "page",
		required: false,
		instructions: "",
	},
	system: false,
};

const reference = (
	field_type: string,
	accessor: string,
	settings: Record<string, unknown>,
): Field => ({
	field_type,
	config: {
		name: accessor,
		api_accessor: accessor,
		required: false,
		instructions: "",
	},
	settings,
	system: false,
});

const spec: Field[] = [
	// A Field that no longer pins — what a `version` Field migrates to.
	reference("reference", "related", { spec: [page], pin_mode: "none" }),
	reference("reference", "pinned", { pin_mode: "release" }),
	reference("single_reference", "primary", { spec: [page] }),
];

function Dirty() {
	const { isDirty } = useFormState();
	return <output data-testid="dirty">{String(isDirty)}</output>;
}

function Harness({
	onValid,
	defaults,
}: {
	onValid: (values: Record<string, unknown>) => void;
	defaults: Record<string, unknown>;
}) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
		defaultValues: defaults,
	});
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
	related: [
		{
			id: "c1",
			label: "A stored name",
			attributes: { page: 3 },
			pin: "version-7",
			children: [{ id: "c2", display_name: "Another", blueprint_id: "bp" }],
		},
	],
	pinned: [{ id: "c3", pin: "release-2", attributes: {} }],
	primary: { id: "c4", attributes: { page: 1 }, label: "x" },
};

describe("SpecForm on legacy Reference values", () => {
	it("opens clean, and the next save stores the new shape", async () => {
		const onValid = vi.fn();
		render(<Harness onValid={onValid} defaults={legacy} />);

		await waitFor(() =>
			expect(screen.getByTestId("dirty")).toHaveTextContent("false"),
		);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
		const values = onValid.mock.calls[0][0] as {
			related: Record<string, unknown>[];
			pinned: Record<string, unknown>[];
			primary: Record<string, unknown>;
		};

		const [root] = values.related;
		const [child] = root.children as Record<string, unknown>[];
		expect(root).toEqual({
			_id: expect.any(String),
			id: "c1",
			values: { page: 3 },
			children: [{ _id: expect.any(String), id: "c2" }],
		});
		// A Release Pin survives only where the Field pins Releases.
		expect(values.pinned).toEqual([
			{ _id: expect.any(String), id: "c3", pin: "release-2" },
		]);
		expect(values.primary).toEqual({
			_id: expect.any(String),
			id: "c4",
			values: { page: 1 },
		});
		const ids = [root._id, child._id, values.pinned[0]._id, values.primary._id];
		for (const id of ids) expect(isRowId(id)).toBe(true);
		expect(new Set(ids).size).toBe(ids.length);
		expect(screen.getByTestId("dirty")).toHaveTextContent("false");
	});
});
