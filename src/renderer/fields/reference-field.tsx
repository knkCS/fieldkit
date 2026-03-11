import { useCallback, useEffect, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { FieldProps } from "../../schema/plugin";
import type { ReferenceItem } from "../adapters";
import { useFieldKit } from "../provider";

export function ReferenceField({
	field,
	readOnly,
}: FieldProps<ReferenceSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? {};
	const isSingle = settings.max_items === 1;
	const refAdapter = adapters.reference;

	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<ReferenceItem[]>([]);
	const [resolvedItems, setResolvedItems] = useState<ReferenceItem[]>([]);
	const [searching, setSearching] = useState(false);

	const resolveIds = useCallback(
		async (ids: string[]) => {
			if (!refAdapter || ids.length === 0) return;
			try {
				const items = await refAdapter.fetch(ids);
				setResolvedItems(items);
			} catch {
				// silently fail — IDs will be shown as fallback
			}
		},
		[refAdapter],
	);

	const handleSearch = useCallback(
		async (query: string) => {
			if (!refAdapter || query.length === 0) {
				setSearchResults([]);
				return;
			}
			setSearching(true);
			try {
				const results = await refAdapter.search(
					settings.blueprints ?? [],
					query,
				);
				setSearchResults(results);
			} catch {
				setSearchResults([]);
			} finally {
				setSearching(false);
			}
		},
		[refAdapter, settings.blueprints],
	);

	if (!refAdapter) {
		return (
			<div style={{ marginBottom: "1rem" }}>
				<label
					style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
				>
					{field.config.name}
				</label>
				<p style={{ color: "#999", fontSize: "0.875rem" }}>
					Reference adapter not configured
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
					const currentValue = formField.value;
					const currentIds: string[] = isSingle
						? currentValue
							? [currentValue]
							: []
						: Array.isArray(currentValue)
							? currentValue
							: [];

					// Resolve display names on mount / value change
					// eslint-disable-next-line react-hooks/rules-of-hooks
					useEffect(() => {
						resolveIds(currentIds);
					}, [currentIds]); // eslint-disable-line react-hooks/exhaustive-deps

					const getDisplayName = (id: string) => {
						const item = resolvedItems.find((r) => r.id === id);
						return item?.display_name ?? id;
					};

					const handleAdd = (item: ReferenceItem) => {
						if (isSingle) {
							formField.onChange(item.id);
						} else {
							const arr = Array.isArray(formField.value)
								? [...formField.value]
								: [];
							if (!arr.includes(item.id)) {
								arr.push(item.id);
								formField.onChange(arr);
							}
						}
						setSearchQuery("");
						setSearchResults([]);
					};

					const handleRemove = (id: string) => {
						if (isSingle) {
							formField.onChange("");
						} else {
							const arr = Array.isArray(formField.value)
								? formField.value.filter((v: string) => v !== id)
								: [];
							formField.onChange(arr);
						}
					};

					return (
						<>
							{/* Selected items */}
							{currentIds.length > 0 && (
								<div style={{ marginBottom: "0.5rem" }}>
									{currentIds.map((id) => (
										<span
											key={id}
											style={{
												display: "inline-flex",
												alignItems: "center",
												gap: "0.25rem",
												padding: "0.25rem 0.5rem",
												marginRight: "0.25rem",
												marginBottom: "0.25rem",
												backgroundColor: "#f0f0f0",
												borderRadius: "4px",
												fontSize: "0.875rem",
											}}
										>
											{getDisplayName(id)}
											{!readOnly && (
												<button
													type="button"
													onClick={() => handleRemove(id)}
													style={{
														border: "none",
														background: "none",
														cursor: "pointer",
														padding: "0 2px",
														fontSize: "1rem",
														lineHeight: 1,
													}}
													aria-label={`Remove ${getDisplayName(id)}`}
												>
													x
												</button>
											)}
										</span>
									))}
								</div>
							)}

							{/* Search input */}
							{!readOnly && (
								<div style={{ position: "relative" }}>
									<input
										type="text"
										value={searchQuery}
										onChange={(e) => {
											setSearchQuery(e.target.value);
											handleSearch(e.target.value);
										}}
										placeholder="Search references..."
										style={{
											width: "100%",
											padding: "0.5rem",
											border: fieldState.error
												? "1px solid red"
												: "1px solid #ccc",
											borderRadius: "4px",
										}}
									/>
									{searching && (
										<span
											style={{
												position: "absolute",
												right: "0.5rem",
												top: "0.5rem",
												color: "#999",
												fontSize: "0.75rem",
											}}
										>
											Searching...
										</span>
									)}
									{searchResults.length > 0 && (
										<ul
											style={{
												position: "absolute",
												top: "100%",
												left: 0,
												right: 0,
												backgroundColor: "white",
												border: "1px solid #ccc",
												borderTop: "none",
												borderRadius: "0 0 4px 4px",
												listStyle: "none",
												margin: 0,
												padding: 0,
												maxHeight: "200px",
												overflowY: "auto",
												zIndex: 10,
											}}
										>
											{searchResults.map((item) => (
												<li key={item.id}>
													<button
														type="button"
														onClick={() => handleAdd(item)}
														style={{
															width: "100%",
															textAlign: "left",
															padding: "0.5rem",
															border: "none",
															background: "none",
															cursor: "pointer",
														}}
													>
														{item.display_name}
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
							)}

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
ReferenceField.displayName = "ReferenceField";
