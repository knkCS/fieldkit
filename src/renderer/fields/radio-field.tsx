import { Controller, useFormContext } from "react-hook-form";
import type { RadioSettings } from "../../schema/field-types/radio";
import type { FieldProps } from "../../schema/plugin";

export function RadioField({ field, readOnly }: FieldProps<RadioSettings>) {
	const { control } = useFormContext();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? { options: {} };
	const options = settings.options ?? {};

	return (
		<div style={{ marginBottom: "1rem" }}>
			<fieldset style={{ border: "none", padding: 0, margin: 0 }}>
				<legend
					style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
				>
					{field.config.name}
					{field.config.required && <span style={{ color: "red" }}> *</span>}
				</legend>
				<Controller
					name={accessor}
					control={control}
					render={({ field: formField, fieldState }) => (
						<>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: "0.5rem",
								}}
							>
								{Object.entries(options).map(([value, label]) => (
									<label
										key={value}
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
											cursor: readOnly ? "default" : "pointer",
										}}
									>
										<input
											type="radio"
											name={accessor}
											value={value}
											checked={formField.value === value}
											onChange={() => formField.onChange(value)}
											disabled={readOnly}
										/>
										{label}
									</label>
								))}
							</div>
							{fieldState.error && (
								<span style={{ color: "red", fontSize: "0.875rem" }}>
									{fieldState.error.message}
								</span>
							)}
						</>
					)}
				/>
			</fieldset>
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
RadioField.displayName = "RadioField";
