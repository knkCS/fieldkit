import { Controller, useFormContext } from "react-hook-form";
import type { CodeSettings } from "../../schema/field-types/code";
import type { FieldProps } from "../../schema/plugin";

export function CodeField({ field, readOnly }: FieldProps<CodeSettings>) {
	const { control } = useFormContext();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? {};

	return (
		<div style={{ marginBottom: "1rem" }}>
			<label
				htmlFor={accessor}
				style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
			>
				{field.config.name}
				{field.config.required && <span style={{ color: "red" }}> *</span>}
				{settings.language && (
					<span
						style={{
							fontWeight: 400,
							fontSize: "0.75rem",
							marginLeft: "0.5rem",
							color: "#888",
						}}
					>
						{settings.language}
					</span>
				)}
			</label>
			<Controller
				name={accessor}
				control={control}
				render={({ field: formField, fieldState }) => (
					<>
						<textarea
							{...formField}
							id={accessor}
							readOnly={readOnly}
							rows={10}
							spellCheck={false}
							style={{
								width: "100%",
								padding: "0.75rem",
								border: fieldState.error ? "1px solid red" : "1px solid #ccc",
								borderRadius: "4px",
								resize: "vertical",
								fontFamily:
									"'Fira Code', 'Cascadia Code', 'JetBrains Mono', monospace",
								fontSize: "0.8125rem",
								lineHeight: 1.6,
								tabSize: 2,
								backgroundColor: "#fafafa",
							}}
						/>
						{fieldState.error && (
							<span style={{ color: "red", fontSize: "0.875rem" }}>
								{fieldState.error.message}
							</span>
						)}
					</>
				)}
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
CodeField.displayName = "CodeField";
