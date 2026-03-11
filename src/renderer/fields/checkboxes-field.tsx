import { Controller, useFormContext } from "react-hook-form";
import type { CheckboxesSettings } from "../../schema/field-types/checkboxes";
import type { FieldProps } from "../../schema/plugin";

export function CheckboxesField({
	field,
	readOnly,
}: FieldProps<CheckboxesSettings>) {
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
					render={({ field: formField, fieldState }) => {
						const selected: string[] = Array.isArray(formField.value)
							? formField.value
							: [];
						return (
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
												type="checkbox"
												value={value}
												checked={selected.includes(value)}
												onChange={(e) => {
													if (e.target.checked) {
														formField.onChange([...selected, value]);
													} else {
														formField.onChange(
															selected.filter((v) => v !== value),
														);
													}
												}}
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
						);
					}}
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
CheckboxesField.displayName = "CheckboxesField";
