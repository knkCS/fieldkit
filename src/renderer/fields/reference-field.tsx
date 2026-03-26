import { Box, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { FormField } from "@knkcs/anker/forms";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { ReferenceSettings } from "../../schema/field-types/reference";
import type { FieldProps } from "../../schema/plugin";
import type { ReferenceItem } from "../adapters";
import { useResolvedReferences } from "../hooks/use-resolved-references";
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

	const {
		resolved,
		error,
		search,
		searchResults,
		searching,
		clearSearch,
		resolveIds,
	} = useResolvedReferences({
		adapter: refAdapter,
		blueprints: settings?.blueprints ?? [],
	});

	const watchedValue = useWatch({ name: accessor, control });
	const currentIds: string[] = isSingle
		? watchedValue
			? [watchedValue]
			: []
		: Array.isArray(watchedValue)
			? watchedValue
			: [];
	const idsKey = JSON.stringify(currentIds);

	useEffect(() => {
		const ids: string[] = JSON.parse(idsKey);
		resolveIds(ids);
	}, [idsKey, resolveIds]);

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

	const getDisplayName = (id: string) => {
		const item = resolved.find((r) => r.id === id);
		return item?.display_name ?? id;
	};

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
							clearSearch();
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

								{/* Error display */}
								{error && (
									<Text color="fg.error" fontSize="sm" mb={2}>
										{error}
									</Text>
								)}

								{/* Search input */}
								{!readOnly && (
									<Box position="relative">
										<Input
											value={searchQuery}
											onChange={(e) => {
												setSearchQuery(e.target.value);
												search(e.target.value);
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
														<button
															type="button"
															onClick={() => handleAdd(item)}
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
ReferenceField.displayName = "ReferenceField";
