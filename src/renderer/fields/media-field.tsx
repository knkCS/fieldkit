import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { MediaSettings } from "../../schema/field-types/media";
import type { FieldProps } from "../../schema/plugin";
import type { MediaItem } from "../adapters";
import { useFieldKit } from "../provider";

export function MediaField({ field, readOnly }: FieldProps<MediaSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const accessor = field.config.api_accessor;
	const settings = field.settings ?? {};
	const mediaAdapter = adapters.media;

	const [resolvedItems, setResolvedItems] = useState<MediaItem[]>([]);
	const [uploading, setUploading] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const browseItems = useCallback(async () => {
		if (!mediaAdapter) return;
		try {
			const mimeTypes = settings.accept?.length ? settings.accept : undefined;
			const items = await mediaAdapter.browse({ mime_types: mimeTypes });
			setResolvedItems(items);
		} catch {
			// silently fail
		}
	}, [mediaAdapter, settings.accept]);

	// Load media items on mount
	useEffect(() => {
		browseItems();
	}, [browseItems]);

	if (!mediaAdapter) {
		return (
			<div style={{ marginBottom: "1rem" }}>
				<label
					style={{ display: "block", marginBottom: "0.25rem", fontWeight: 500 }}
				>
					{field.config.name}
				</label>
				<p style={{ color: "#999", fontSize: "0.875rem" }}>
					Media adapter not configured
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
					const currentIds: string[] = Array.isArray(formField.value)
						? formField.value
						: [];

					const getMediaItem = (id: string) =>
						resolvedItems.find((item) => item.id === id);

					const handleRemove = (id: string) => {
						formField.onChange(currentIds.filter((v) => v !== id));
					};

					const handleUpload = async (file: File) => {
						if (!mediaAdapter) return;
						setUploading(true);
						try {
							const item = await mediaAdapter.upload(file);
							const newIds = [...currentIds, item.id];
							formField.onChange(newIds);
							setResolvedItems((prev) => [...prev, item]);
						} catch {
							// upload failed silently
						} finally {
							setUploading(false);
						}
					};

					const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
						const file = e.target.files?.[0];
						if (file) {
							handleUpload(file);
							e.target.value = "";
						}
					};

					const atLimit =
						settings.max_items != null &&
						currentIds.length >= settings.max_items;

					return (
						<>
							{/* Selected media items */}
							{currentIds.length > 0 && (
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: "0.5rem",
										marginBottom: "0.5rem",
									}}
								>
									{currentIds.map((id) => {
										const item = getMediaItem(id);
										return (
											<div
												key={id}
												style={{
													display: "flex",
													alignItems: "center",
													gap: "0.5rem",
													padding: "0.25rem 0.5rem",
													backgroundColor: "#f5f5f5",
													borderRadius: "4px",
													fontSize: "0.875rem",
												}}
											>
												<span>{item?.filename ?? id}</span>
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
														aria-label={`Remove ${item?.filename ?? id}`}
													>
														x
													</button>
												)}
											</div>
										);
									})}
								</div>
							)}

							{/* Upload button */}
							{!readOnly && !atLimit && (
								<div>
									<input
										ref={fileInputRef}
										type="file"
										onChange={handleFileChange}
										accept={settings.accept?.join(",") ?? undefined}
										style={{ display: "none" }}
									/>
									<button
										type="button"
										onClick={() => fileInputRef.current?.click()}
										disabled={uploading}
										style={{
											padding: "0.5rem 1rem",
											border: "1px solid #ccc",
											borderRadius: "4px",
											backgroundColor: "white",
											cursor: uploading ? "not-allowed" : "pointer",
										}}
									>
										{uploading ? "Uploading..." : "Upload file"}
									</button>
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
MediaField.displayName = "MediaField";
