// A Boolean Field's default (#1859 in knkboor/general): new content starts at
// `config.default_value`, absent is off, and a stored value always wins over
// the default — the form a Consumer seeds through formDefaults() renders and
// saves exactly that.
import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import { builtInFieldTypes } from "../../../schema/field-types";
import { formDefaults } from "../../../schema/form-defaults";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";

const boolean = (api_accessor: string, default_value?: boolean): Field => ({
	field_type: "boolean",
	config: {
		name: api_accessor,
		api_accessor,
		required: false,
		instructions: "",
		...(default_value === undefined ? {} : { default_value }),
	},
	settings: null,
	system: false,
});

const spec: Field[] = [
	boolean("defaulted_on", true),
	boolean("defaulted_off", false),
	boolean("no_default"),
];

function Consumer({
	stored,
	onValid,
}: {
	stored?: Record<string, unknown>;
	onValid: (values: Record<string, unknown>) => void;
}) {
	const methods = useForm({
		resolver: zodResolver(specToZodSchema(spec, builtInFieldTypes)),
		defaultValues: formDefaults(spec, stored, builtInFieldTypes),
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

function switchFor(name: string): HTMLInputElement {
	return document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
}

describe("Boolean Field default in the renderer", () => {
	it("starts new content at the default, absent being off, and saves it", async () => {
		const onValid = vi.fn();
		render(<Consumer onValid={onValid} />);

		expect(switchFor("defaulted_on").checked).toBe(true);
		expect(switchFor("defaulted_off").checked).toBe(false);
		expect(switchFor("no_default").checked).toBe(false);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
		expect(onValid.mock.calls[0][0]).toEqual({
			defaulted_on: true,
			defaulted_off: false,
			no_default: false,
		});
	});

	it("never applies the default over a stored value", async () => {
		const onValid = vi.fn();
		render(
			<Consumer
				stored={{ defaulted_on: false, no_default: true }}
				onValid={onValid}
			/>,
		);

		expect(switchFor("defaulted_on").checked).toBe(false);
		expect(switchFor("no_default").checked).toBe(true);

		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(onValid).toHaveBeenCalledTimes(1));
		expect(onValid.mock.calls[0][0]).toMatchObject({
			defaulted_on: false,
			no_default: true,
		});
	});
});
