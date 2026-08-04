import { Box, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { TocReferenceSettings } from "../../schema/field-types/toc-reference";
import type { FieldProps } from "../../schema/plugin";
import type { ReferenceItem } from "../adapters";
import { useAdapterErrorReporter } from "../hooks/use-adapter-error-reporter";
import { useResolvedContentName } from "../hooks/use-resolved-content-name";
import { useFieldKit } from "../provider";

/** One menu's worth of matches. This control has no pagination of its own —
 * typing is how the list is narrowed. */
const MENU_PAGE_SIZE = 50;

export function TocReferenceField({
	field,
	readOnly,
}: FieldProps<TocReferenceSettings>) {
	const { control } = useFormContext();
	const { adapters } = useFieldKit();
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const refAdapter = adapters.reference;
	const report = useAdapterErrorReporter(accessor, "Reference adapter failed");

	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<ReferenceItem[]>([]);
	const [searching, setSearching] = useState(false);

	// Serialized, not the array itself: a Consumer's settings object is a fresh
	// literal on every render, and effect deps must not churn with it.
	const blueprintsKey = JSON.stringify(settings?.blueprints ?? []);
	const blueprints = useMemo(
		() => JSON.parse(blueprintsKey) as string[],
		[blueprintsKey],
	);

	const watchedValue = useWatch({ name: accessor, control });
	const currentId = typeof watchedValue === "string" ? watchedValue : "";

	// The stored Content's current name, resolved on every load. A failure
	// reaches the Consumer's `onError` and leaves the id on screen — it is not
	// this Field's business to render an Adapter outage.
	const resolvedName = useResolvedContentName(currentId || null, accessor);

	useEffect(() => {
		if (!refAdapter || searchQuery.length === 0) {
			setSearchResults([]);
			return;
		}
		let cancelled = false;
		setSearching(true);
		refAdapter
			.search({
				blueprintIds: blueprints,
				query: searchQuery,
				filters: {},
				page: 1,
				page_size: MENU_PAGE_SIZE,
			})
			.then(({ items }) => {
				if (cancelled) return;
				setSearchResults(items);
				setSearching(false);
			})
			.catch((error: unknown) => {
				if (cancelled) return;
				setSearchResults([]);
				setSearching(false);
				report(error);
			});
		return () => {
			cancelled = true;
		};
	}, [refAdapter, blueprints, searchQuery, report]);

	if (!refAdapter) {
		return (
			<FormField name={accessor} label={config.name} readOnly={readOnly}>
				{() => (
					<Text color="fg.muted" fontSize="sm">
						Reference adapter not configured
					</Text>
				)}
			</FormField>
		);
	}

	const displayName = resolvedName ?? currentId;

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
						const handleSelect = (item: ReferenceItem) => {
							formField.onChange(item.id);
							setSearchQuery("");
						};

						const handleClear = () => {
							formField.onChange("");
						};

						return (
							<Box>
								{/* Selected item */}
								{currentId && (
									<Flex gap={1} mb={2}>
										<Flex
											align="center"
											gap={1}
											px={2}
											py={1}
											bg="bg.muted"
											borderRadius="md"
											fontSize="sm"
										>
											<Text>{displayName}</Text>
											{!readOnly && (
												<IconButton
													aria-label={`Remove ${displayName}`}
													size="2xs"
													variant="ghost"
													onClick={handleClear}
												>
													<X size={12} />
												</IconButton>
											)}
										</Flex>
									</Flex>
								)}

								{/* Search input */}
								{!readOnly && !currentId && (
									<Box position="relative">
										<Input
											value={searchQuery}
											onChange={(e) => setSearchQuery(e.target.value)}
											placeholder="Search TOC reference..."
										/>
										{searching && (
											<Text
												position="absolute"
												right={2}
												top="50%"
												transform="translateY(-50%)"
												color="fg.muted"
												fontSize="xs"
											>
												Searching...
											</Text>
										)}
										{searchResults.length > 0 && (
											<Box
												position="absolute"
												top="100%"
												left={0}
												right={0}
												bg="bg.panel"
												borderWidth="1px"
												borderColor="border"
												borderTopWidth={0}
												borderBottomRadius="md"
												maxH="200px"
												overflowY="auto"
												zIndex={10}
											>
												{searchResults.map((item) => (
													<Box
														key={item.id}
														asChild
														w="full"
														textAlign="left"
														px={3}
														py={2}
														fontSize="sm"
														cursor="pointer"
														_hover={{ bg: "bg.muted" }}
													>
														<button
															type="button"
															onClick={() => handleSelect(item)}
														>
															{item.display_name}
														</button>
													</Box>
												))}
											</Box>
										)}
									</Box>
								)}
							</Box>
						);
					}}
				/>
			)}
		</FormField>
	);
}
TocReferenceField.displayName = "TocReferenceField";
