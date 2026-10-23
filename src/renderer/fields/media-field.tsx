import { Badge, Box, Button, Flex, IconButton, Text } from "@chakra-ui/react";
import {
	type BaseOption,
	chakraComponents,
	type GroupBase,
	type LookupPage,
	type LookupSearchArgs,
	LookupSelect,
	type OptionProps,
} from "@knkcs/anker/atoms";
import { FormField } from "@knkcs/anker/forms";
import { Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { MediaSettings } from "../../schema/field-types/media";
import type { FieldProps } from "../../schema/plugin";
import type { MediaItem } from "../adapters";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import {
	describeMedia,
	storedMediaIds,
	useResolvedMedia,
} from "../hooks/use-resolved-media";
import { useFieldKit } from "../provider";

/** An asset as the picker offers it: anker's option, with the asset kept so
 * a pick names itself without a `resolve` round trip. */
interface MediaOption extends BaseOption {
	description: string;
	item: MediaItem;
}

const MediaOptionRow = ({
	data,
	...props
}: OptionProps<MediaOption, boolean, GroupBase<MediaOption>>) => (
	<chakraComponents.Option data={data} {...props}>
		<Box minWidth="0">
			<Text>{data.label}</Text>
			{data.description && (
				<Text fontSize="xs" color="fg.muted">
					{data.description}
				</Text>
			)}
		</Box>
	</chakraComponents.Option>
);
MediaOptionRow.displayName = "MediaOptionRow";

/** Hoisted so react-select never remounts an open menu. */
const MEDIA_COMPONENTS = { Option: MediaOptionRow };

/**
 * A list of asset ids, filled by uploading a file or picking an existing one
 * (ADR-0029).
 *
 * - **Names.** Stored ids are named through the adapter's optional
 *   `resolve` — file name, type and size, a deleted asset marked as such. An
 *   id it leaves out, or every id without one, shows as itself.
 * - **Picks.** With `browse`, a picker searches the existing assets with
 *   what was typed and the Field's `accept`, and drops the ones already held.
 *   Without it the field offers upload only (ADR-0027). Nothing is browsed
 *   until somebody opens the picker.
 * - **Uploads** carry the Field as `upload`'s second argument, so the
 *   Consumer decides where the file is stored.
 *
 * Adding — by either route — stops at `max_items`.
 */
export function MediaField({ field, readOnly }: FieldProps<MediaSettings>) {
	const { setValue, getValues } = useFormContext();
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const mediaAdapter = adapters.media;

	const currentIds = storedMediaIds(useWatch({ name: accessor }));

	const report = useAdapterErrorReporter(accessor, "Media adapter failed");
	const names = useResolvedMedia(mediaAdapter?.resolve, currentIds, report);
	const { remember } = names;

	const [uploading, setUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const accept = settings?.accept?.length ? settings.accept : undefined;
	const maxItems = settings?.max_items;
	const atLimit = maxItems != null && currentIds.length >= maxItems;

	// Reads the form at the moment of writing, not the render's snapshot: an
	// upload resolves after the person may have picked or removed another.
	const write = useCallback(
		(next: (ids: string[]) => string[]) => {
			setValue(accessor, next(storedMediaIds(getValues(accessor))), {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
		},
		[accessor, getValues, setValue],
	);

	const add = useCallback(
		(item: MediaItem) => {
			remember(item);
			write((ids) => {
				if (ids.includes(item.id)) return ids;
				if (maxItems != null && ids.length >= maxItems) return ids;
				return [...ids, item.id];
			});
		},
		[remember, write, maxItems],
	);

	const browse = mediaAdapter?.browse;
	const search = useCallback(
		async ({
			query,
			signal,
		}: LookupSearchArgs): Promise<LookupPage<MediaOption>> => {
			if (!browse) return { items: [] };
			try {
				const items = await browse({
					query,
					...(accept ? { mime_types: accept } : {}),
				});
				const held = new Set(storedMediaIds(getValues(accessor)));
				return {
					items: items
						.filter((item) => !held.has(item.id))
						.map((item) => ({
							id: item.id,
							label: item.filename,
							description: describeMedia(item),
							item,
						})),
					// `browse` answers one list; there is no next page to ask for.
					nextCursor: null,
				};
			} catch (e) {
				if (!signal.aborted) report(e);
				throw e;
			}
		},
		[browse, accept, accessor, getValues, report],
	);

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

	const handleUpload = async (file: File) => {
		setError(null);
		setUploading(true);
		try {
			add(await mediaAdapter.upload(file, { field }));
		} catch (e) {
			report(e);
			setError("Upload failed");
		} finally {
			setUploading(false);
		}
	};

	return (
		<FormField
			name={accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(formField) => (
				<Box>
					{currentIds.length > 0 && (
						<Flex direction="column" gap={1} mb={2}>
							{currentIds.map((id) => {
								const item = names.item(id);
								const name = item?.filename || id;
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
										<Text
											truncate
											color={item?.deleted ? "fg.muted" : undefined}
											textDecoration={
												item?.deleted ? "line-through" : undefined
											}
										>
											{name}
										</Text>
										{item && !item.deleted && (
											<Text color="fg.muted" fontSize="xs" flexShrink={0}>
												{describeMedia(item)}
											</Text>
										)}
										{item?.deleted && (
											<Badge colorPalette="gray" size="sm" flexShrink={0}>
												Deleted
											</Badge>
										)}
										{!readOnly && (
											<IconButton
												aria-label={`Remove ${name}`}
												size="2xs"
												variant="ghost"
												ms="auto"
												onClick={() =>
													write((ids) => ids.filter((v) => v !== id))
												}
											>
												<X size={12} />
											</IconButton>
										)}
									</Flex>
								);
							})}
						</Flex>
					)}

					{!readOnly && !atLimit && (
						<Flex gap={2} align="center" wrap="wrap">
							<input
								ref={fileInputRef}
								type="file"
								data-testid={`${accessor}-file-input`}
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) {
										handleUpload(file);
										e.target.value = "";
									}
								}}
								accept={accept?.join(",")}
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
							{browse && (
								<Box flex="1" minWidth="12rem">
									<LookupSelect<MediaOption>
										inputId={accessor}
										aria-describedby={formField["aria-describedby"]}
										// An "add" control, not a selection: it never holds the
										// pick — the list above does.
										value={null}
										search={search}
										onBlur={formField.onBlur}
										onChange={(next) => {
											const option = Array.isArray(next) ? next[0] : next;
											if (option) add((option as MediaOption).item);
										}}
										components={MEDIA_COMPONENTS}
										placeholder="Pick an existing file…"
									/>
								</Box>
							)}
						</Flex>
					)}
					{error && (
						<Text color="fg.error" fontSize="sm">
							{error}
						</Text>
					)}
				</Box>
			)}
		</FormField>
	);
}
MediaField.displayName = "MediaField";
