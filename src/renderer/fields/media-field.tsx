import { Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { MediaSettings } from "../../schema/field-types/media";
import type { FieldProps } from "../../schema/plugin";
import type { MediaItem } from "../adapters";
import { useFieldKit } from "../provider";

export function MediaField({ field, readOnly }: FieldProps<MediaSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const mediaAdapter = adapters.media;

	const [resolvedItems, setResolvedItems] = useState<MediaItem[]>([]);
	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const browseItems = useCallback(async () => {
		if (!mediaAdapter) return;
		try {
			const mimeTypes = settings?.accept?.length ? settings.accept : undefined;
			const items = await mediaAdapter.browse({ mime_types: mimeTypes });
			setResolvedItems(items);
		} catch (e) {
			console.error("Media operation failed:", e);
			setError("Failed to load media");
		}
	}, [mediaAdapter, settings?.accept]);

	// Load media items on mount
	useEffect(() => {
		browseItems();
	}, [browseItems]);

	if (!mediaAdapter) {
		return (
			<FormField name={accessor} label={config.name} readOnly={readOnly}>
				{() => (
					<Text color="fg.muted" fontSize="sm">
						Media adapter not configured
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
							setError(null);
							setUploading(true);
							try {
								const item = await mediaAdapter.upload(file);
								const newIds = [...currentIds, item.id];
								formField.onChange(newIds);
								setResolvedItems((prev) => [...prev, item]);
							} catch (e) {
								console.error("Media operation failed:", e);
								setError("Failed to load media");
							} finally {
								setUploading(false);
							}
						};

						const handleFileChange = (
							e: React.ChangeEvent<HTMLInputElement>,
						) => {
							const file = e.target.files?.[0];
							if (file) {
								handleUpload(file);
								e.target.value = "";
							}
						};

						const atLimit =
							settings?.max_items != null &&
							currentIds.length >= settings.max_items;

						return (
							<Box>
								{/* Selected media items */}
								{currentIds.length > 0 && (
									<Flex gap={2} flexWrap="wrap" mb={2}>
										{currentIds.map((id) => {
											const item = getMediaItem(id);
											return (
												<Flex
													key={id}
													align="center"
													gap={2}
													px={2}
													py={1}
													bg="bg.muted"
													borderRadius="md"
													fontSize="sm"
												>
													<Text>{item?.filename ?? id}</Text>
													{!readOnly && (
														<IconButton
															aria-label={`Remove ${item?.filename ?? id}`}
															size="2xs"
															variant="ghost"
															onClick={() => handleRemove(id)}
														>
															<X size={12} />
														</IconButton>
													)}
												</Flex>
											);
										})}
									</Flex>
								)}

								{/* Upload button */}
								{!readOnly && !atLimit && (
									<Box>
										<input
											ref={fileInputRef}
											type="file"
											onChange={handleFileChange}
											accept={settings?.accept?.join(",") ?? undefined}
											style={{ display: "none" }}
										/>
										<Button
											size="sm"
											variant="outline"
											onClick={() => {
												setError(null);
												fileInputRef.current?.click();
											}}
											disabled={uploading}
										>
											<Upload size={16} />
											{uploading ? "Uploading..." : "Upload file"}
										</Button>
									</Box>
								)}
								{error && (
									<Text color="fg.muted" fontSize="sm">
										{error}
									</Text>
								)}
							</Box>
						);
					}}
				/>
			)}
		</FormField>
	);
}
MediaField.displayName = "MediaField";
