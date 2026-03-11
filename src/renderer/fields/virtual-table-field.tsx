import { Box, Table, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
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
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const blueprintAdapter = adapters.blueprint;

	const [schema, setSchema] = useState<FieldDef[]>([]);
	const [loading, setLoading] = useState(false);

	const fetchSchema = useCallback(async () => {
		if (!blueprintAdapter || !settings?.blueprint) return;
		setLoading(true);
		try {
			const fields = await blueprintAdapter.getSchema(settings.blueprint);
			setSchema(fields);
		} catch {
			setSchema([]);
		} finally {
			setLoading(false);
		}
	}, [blueprintAdapter, settings?.blueprint]);

	useEffect(() => {
		fetchSchema();
	}, [fetchSchema]);

	if (!blueprintAdapter) {
		return (
			<FormField name={accessor} label={config.name} readOnly={readOnly}>
				{() => (
					<Text color="fg.muted" fontSize="sm">
						Blueprint adapter not configured
					</Text>
				)}
			</FormField>
		);
	}

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{() => (
				<Controller
					name={accessor}
					control={control}
					render={({ field: formField }) => {
						const rows: Record<string, unknown>[] = Array.isArray(
							formField.value,
						)
							? formField.value
							: [];

						if (loading) {
							return (
								<Text color="fg.muted" fontSize="sm">
									Loading table schema...
								</Text>
							);
						}

						const columns = schema.filter((f) => !f.config.hidden).slice(0, 5);

						return (
							<Box>
								<Box overflowX="auto">
									<Table.Root size="sm" variant="outline">
										<Table.Header>
											<Table.Row>
												{columns.map((col) => (
													<Table.ColumnHeader key={col.config.api_accessor}>
														{col.config.name}
													</Table.ColumnHeader>
												))}
												{columns.length === 0 && (
													<Table.ColumnHeader>Data</Table.ColumnHeader>
												)}
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{rows.length === 0 ? (
												<Table.Row>
													<Table.Cell
														colSpan={columns.length || 1}
														textAlign="center"
														color="fg.muted"
													>
														No records
													</Table.Cell>
												</Table.Row>
											) : (
												rows.map((row, idx) => (
													<Table.Row key={idx}>
														{columns.map((col) => (
															<Table.Cell key={col.config.api_accessor}>
																{row[col.config.api_accessor] != null
																	? String(row[col.config.api_accessor])
																	: "\u2014"}
															</Table.Cell>
														))}
														{columns.length === 0 && (
															<Table.Cell>{JSON.stringify(row)}</Table.Cell>
														)}
													</Table.Row>
												))
											)}
										</Table.Body>
									</Table.Root>
								</Box>
								<Text fontSize="xs" color="fg.muted" mt={1}>
									{rows.length} record{rows.length !== 1 ? "s" : ""}
									{readOnly ? " (read only)" : ""}
								</Text>
							</Box>
						);
					}}
				/>
			)}
		</FormField>
	);
}
VirtualTableField.displayName = "VirtualTableField";
