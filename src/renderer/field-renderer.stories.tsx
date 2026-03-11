import { zodResolver } from "@hookform/resolvers/zod";
import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { boolean, number, select, text } from "../schema/builders";
import { defineSpec } from "../schema/define-spec";
import { builtInFieldTypes } from "../schema/field-types";
import { specToZodSchema } from "../schema/zod-builder";
import { FieldRenderer } from "./field-renderer";
import { FieldKitProvider } from "./provider";

/* ------------------------------------------------------------------ */
/*  Specs                                                              */
/* ------------------------------------------------------------------ */

const mixedSpec = defineSpec([
	text("title", { name: "Title", required: true, instructions: "Enter a title" }),
	number("price", { name: "Price", min: 0, append: "EUR" }),
	boolean("published", { name: "Published" }),
	select("category", {
		name: "Category",
		options: { tech: "Technology", art: "Art", science: "Science" },
	}),
]);

const validationSpec = defineSpec([
	text("email", {
		name: "Email",
		required: true,
		instructions: "Must be a valid email",
	}),
	number("age", {
		name: "Age",
		required: true,
		min: 0,
		max: 150,
	}),
	text("username", {
		name: "Username",
		required: true,
		instructions: "3-20 characters",
	}),
]);

/* ------------------------------------------------------------------ */
/*  Wrapper                                                            */
/* ------------------------------------------------------------------ */

function StoryWrapper({
	spec,
	defaultValues,
	readOnly,
	children,
}: {
	spec: ReturnType<typeof defineSpec>;
	defaultValues?: Record<string, unknown>;
	readOnly?: boolean;
	children?: ReactNode;
}) {
	const schema = specToZodSchema(spec.fields, builtInFieldTypes);
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaultValues ?? spec.defaultValues,
		mode: "onBlur",
	});

	return (
		<FieldKitProvider plugins={builtInFieldTypes}>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit((data) => {
						console.log("Form submitted:", data);
					})}
				>
					<FieldRenderer schema={spec.fields} readOnly={readOnly} />
					{children}
					{!readOnly && (
						<button type="submit" style={{ marginTop: 16 }}>
							Submit
						</button>
					)}
				</form>
			</FormProvider>
		</FieldKitProvider>
	);
}

/* ------------------------------------------------------------------ */
/*  Meta                                                               */
/* ------------------------------------------------------------------ */

const meta = {
	title: "Renderer/FieldRenderer",
	component: FieldRenderer,
	parameters: { layout: "padded" },
} satisfies Meta<typeof FieldRenderer>;

export default meta;
type Story = StoryObj<typeof meta>;

/* ------------------------------------------------------------------ */
/*  Stories                                                            */
/* ------------------------------------------------------------------ */

export const Default: Story = {
	render: () => (
		<StoryWrapper
			spec={mixedSpec}
			defaultValues={{ title: "Hello World", price: 42, published: true }}
		/>
	),
};

export const ReadOnly: Story = {
	render: () => (
		<StoryWrapper
			spec={mixedSpec}
			defaultValues={{
				title: "Read-only Title",
				price: 99,
				published: false,
				category: "tech",
			}}
			readOnly
		/>
	),
};

export const WithValidation: Story = {
	render: () => <StoryWrapper spec={validationSpec} />,
};
