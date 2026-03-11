import { Controller, useFormContext } from "react-hook-form";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { FieldProps } from "../../schema/plugin";

export function RichTextField({
	field,
	readOnly,
}: FieldProps<RichTextSettings>) {
	const { control } = useFormContext();
	const accessor = field.config.api_accessor;

	return (
		<div style={{ marginBottom: "1rem" }}>
			<label
				htmlFor={accessor}
				style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
			>
				{field.config.name}
				{field.config.required && <span style={{ color: "red" }}> *</span>}
			</label>
			<p
				style={{ fontSize: "0.75rem", color: "#999", marginBottom: "0.25rem" }}
			>
				Rich text editor requires @knkcms/knkeditor-editor
			</p>
			<Controller
				name={accessor}
				control={control}
				render={({ field: formField, fieldState }) => {
					const textValue =
						typeof formField.value === "string"
							? formField.value
							: formField.value != null
								? JSON.stringify(formField.value, null, 2)
								: "";

					return (
						<>
							<textarea
								id={accessor}
								value={textValue}
								onChange={(e) => {
									try {
										const parsed = JSON.parse(e.target.value);
										formField.onChange(parsed);
									} catch {
										formField.onChange(e.target.value);
									}
								}}
								onBlur={formField.onBlur}
								ref={formField.ref}
								readOnly={readOnly}
								rows={8}
								style={{
									width: "100%",
									padding: "0.5rem",
									border: fieldState.error ? "1px solid red" : "1px solid #ccc",
									borderRadius: "4px",
									resize: "vertical",
								}}
							/>
							{fieldState.error && (
								<span style={{ color: "red", fontSize: "0.875rem" }}>
									{fieldState.error.message}
								</span>
							)}
						</>
					);
				}}
			/>
			{field.config.instructions && (
				<p
					style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}
				>
					{field.config.instructions}
				</p>
			)}
		</div>
	);
}
RichTextField.displayName = "RichTextField";
