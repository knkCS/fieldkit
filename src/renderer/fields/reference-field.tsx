import { Box, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { X } from "lucide-react";
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
	const { config, settings } = field;
	const accessor = config.api_accessor;
	const isSingle = settings?.max_items === 1;
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
				// silently fail -- IDs will be shown as fallback
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
					settings?.blueprints ?? [],
					query,
				);
				setSearchResults(results);
			} catch {
				setSearchResults([]);
			} finally {
				setSearching(false);
			}
		},
		[refAdapter, settings?.blueprints],
	);

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
							<Box>
								{/* Selected items */}
								{currentIds.length > 0 && (
									<Flex gap={1} flexWrap="wrap" mb={2}>
										{currentIds.map((id) => (
											<Flex
												key={id}
												align="center"
												gap={1}
												px={2}
												py={1}
												bg="bg.muted"
												borderRadius="md"
												fontSize="sm"
											>
												<Text>{getDisplayName(id)}</Text>
												{!readOnly && (
													<IconButton
														aria-label={`Remove ${getDisplayName(id)}`}
														size="2xs"
														variant="ghost"
														onClick={() => handleRemove(id)}
													>
														<X size={12} />
													</IconButton>
												)}
											</Flex>
										))}
									</Flex>
								)}

								{/* Search input */}
								{!readOnly && (
									<Box position="relative">
										<Input
											value={searchQuery}
											onChange={(e) => {
												setSearchQuery(e.target.value);
												handleSearch(e.target.value);
											}}
											placeholder="Search references..."
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
														<button type="button" onClick={() => handleAdd(item)}>
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
ReferenceField.displayName = "ReferenceField";
