import { useCallback, useEffect, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { VirtualTableSettings } from "../../schema/field-types/virtual-table";
import type { FieldProps } from "../../schema/plugin";
import type { Field as FieldDef } from "../../schema/types";
import { useFieldKit } from "../provider";

export function VirtualTableField({
	field,
	readOnly,
}: FieldProps<VirtualTableSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? {};
	const blueprintAdapter = adapters.blueprint;

	const [schema, setSchema] = useState<FieldDef[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchSchema = useCallback(async () => {
		if (!blueprintAdapter || !settings.blueprint) return;
		setLoading(true);
		try {
			const fields = await blueprintAdapter.getSchema(settings.blueprint);
			setSchema(fields);
		} catch {
			setSchema([]);
		} finally {
			setLoading(false);
		}
	}, [blueprintAdapter, settings.blueprint]);

	useEffect(() => {
		fetchSchema();
	}, [fetchSchema]);

	if (!blueprintAdapter) {
		return (
			<div style={{ marginBottom: "1rem" }}>
				<label
					style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
				>
					{field.config.name}
				</label>
				<p style={{ color: "#999", fontSize: "0.875rem" }}>
					Blueprint adapter not configured
				</p>
			</div>
		);
	}

	return (
		<div style={{ marginBottom: "1rem" }}>
			<label
				htmlFor={accessor}
				style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
			>
				{field.config.name}
				{field.config.required && <span style={{ color: "red" }}> *</span>}
			</label>
			<Controller
				name={accessor}
				control={control}
				render={({ field: formField, fieldState }) => {
					const rows: Record<string, unknown>[] = Array.isArray(formField.value)
						? formField.value
						: [];

					if (loading) {
						return (
							<p style={{ color: "#999", fontSize: "0.875rem" }}>
								Loading table schema...
							</p>
						);
					}

					const columns = schema.filter((f) => !f.config.hidden).slice(0, 5);

					return (
						<>
							<div style={{ overflowX: "auto" }}>
								<table
									style={{
										width: "100%",
										borderCollapse: "collapse",
										fontSize: "0.875rem",
									}}
								>
									<thead>
										<tr>
											{columns.map((col) => (
												<th
													key={col.config.api_accessor}
													style={{
														textAlign: "left",
														padding: "0.5rem",
														borderBottom: "2px solid #ddd",
														fontWeight: 600,
													}}
												>
													{col.config.name}
												</th>
											))}
											{columns.length === 0 && (
												<th
													style={{
														textAlign: "left",
														padding: "0.5rem",
														borderBottom: "2px solid #ddd",
													}}
												>
													Data
												</th>
											)}
										</tr>
									</thead>
									<tbody>
										{rows.length === 0 ? (
											<tr>
												<td
													colSpan={columns.length || 1}
													style={{
														padding: "1rem",
														textAlign: "center",
														color: "#999",
													}}
												>
													No records
												</td>
											</tr>
										) : (
											rows.map((row, idx) => (
												<tr key={idx}>
													{columns.map((col) => (
														<td
															key={col.config.api_accessor}
															style={{
																padding: "0.5rem",
																borderBottom: "1px solid #eee",
															}}
														>
															{row[col.config.api_accessor] != null
																? String(row[col.config.api_accessor])
																: "—"}
														</td>
													))}
													{columns.length === 0 && (
														<td
															style={{
																padding: "0.5rem",
																borderBottom: "1px solid #eee",
															}}
														>
															{JSON.stringify(row)}
														</td>
													)}
												</tr>
											))
										)}
									</tbody>
								</table>
							</div>
							<p
								style={{
									fontSize: "0.75rem",
									color: "#999",
									marginTop: "0.25rem",
								}}
							>
								{rows.length} record{rows.length !== 1 ? "s" : ""}
								{readOnly ? " (read only)" : ""}
							</p>
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
VirtualTableField.displayName = "VirtualTableField";
