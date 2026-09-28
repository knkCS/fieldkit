import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { validateValue } from "../../../schema/validate-value";
import { getDefaultValues, specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

function field(
	field_type: string,
	api_accessor: string,
	settings?: Record<string, unknown>,
): Field {
	return {
		field_type,
		config: {
			name: api_accessor,
			api_accessor,
			required: false,
			instructions: "",
		},
		settings,
		system: false,
	};
}

const spec: Field[] = [
	field("text", "title"),
	field("text", "subtitle"),
	field("checkboxes", "tags", { options: { a: "A" } }),
	field("list", "entries"),
	field("number", "count"),
	field("boolean", "published"),
];

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
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

describe("SpecForm submits canonical values (ADR-0021)", () => {
	it('strips "" and [] from what it submits, and keeps 0 and false', async () => {
		const onValid = vi.fn();
		// The form's own defaults are Unset for every empty control — "" for a
		// text, [] for checkboxes and a list — which is what a fresh form
		// submits when nobody touches those controls.
		const defaults = {
			...getDefaultValues(spec, builtInFieldTypes),
			subtitle: "Kept",
			count: 0,
			published: false,
		};
		expect(defaults).toMatchObject({ title: "", tags: [], entries: [] });

		render(<Harness onValid={onValid} defaults={defaults} />);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));

		await waitFor(() => expect(onValid).toHaveBeenCalledOnce());
		const submitted = onValid.mock.calls[0][0];
		expect(submitted).toStrictEqual({
			subtitle: "Kept",
			count: 0,
			published: false,
		});
		// What the form stores is what Go's ValidateValue accepts.
		expect(validateValue(spec, submitted, builtInFieldTypes)).toEqual([]);
	});
});
