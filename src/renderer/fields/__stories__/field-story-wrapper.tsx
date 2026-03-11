import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { builtInFieldTypes } from "../../../schema/field-types";
import type { Field } from "../../../schema/types";
import { specToZodSchema } from "../../../schema/zod-builder";
import type { FieldKitAdapters } from "../../adapters";
import { FieldRenderer } from "../../field-renderer";
import { FieldKitProvider } from "../../provider";

export interface FieldStoryWrapperProps {
	fields: Field[];
	defaultValues?: Record<string, unknown>;
	readOnly?: boolean;
	adapters?: FieldKitAdapters;
}

export function FieldStoryWrapper({
	fields,
	defaultValues,
	readOnly,
	adapters,
}: FieldStoryWrapperProps) {
	const [submittedValues, setSubmittedValues] = useState<Record<
		string,
		unknown
	> | null>(null);

	const schema = specToZodSchema(fields, builtInFieldTypes);
	const methods = useForm({
		resolver: zodResolver(schema),
		defaultValues: defaultValues ?? {},
		mode: "onBlur",
	});

	return (
		<FieldKitProvider
			plugins={builtInFieldTypes}
			adapters={adapters}
		>
			<FormProvider {...methods}>
				<form
					onSubmit={methods.handleSubmit((data) => {
						setSubmittedValues(data);
					})}
				>
					<FieldRenderer schema={fields} readOnly={readOnly} />
					{!readOnly && (
						<button type="submit" style={{ marginTop: 16 }}>
							Submit
						</button>
					)}
				</form>
			</FormProvider>
			{submittedValues && (
				<pre
					style={{
						marginTop: 16,
						padding: 12,
						background: "#f5f5f5",
						borderRadius: 4,
						fontSize: 13,
						overflowX: "auto",
					}}
				>
					{JSON.stringify(submittedValues, null, 2)}
				</pre>
			)}
		</FieldKitProvider>
	);
}
FieldStoryWrapper.displayName = "FieldStoryWrapper";
