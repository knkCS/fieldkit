import { Box, Button, Flex, IconButton, Input, Text } from "@chakra-ui/react";
import { Pagination } from "@knkcs/anker/components";
import { FormField, SearchInput } from "@knkcs/anker/forms";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ListSettings } from "../../schema/field-types/list";
import type { FieldProps } from "../../schema/plugin";

/** One entry paired with its position in the stored array. Search and
 * pagination change which entries are on screen; every mutation is still
 * addressed by the entry's original index, so what the form user sees can
 * never drift from what gets written. */
interface PositionedEntry {
	value: string;
	index: number;
}

/**
 * `list` — a flat, ordered set of free-text entries (`string[]`).
 *
 * Deliberately NOT Pattern D (`useFieldArray`), which the group and blocks
 * fields use and which #48 assumed this field would too: `useFieldArray`
 * cannot hold a flat array of primitives. It maps each item through
 * `{...item, id}`, so a string entry arrives as a character-indexed object
 * (`{"0":"a","1":"l",…}`). The value is therefore held whole through anker's
 * `FormField` render prop — Pattern B, `Controller` underneath — and the
 * array operations are done here.
 */
export function ListField({ field, readOnly }: FieldProps<ListSettings>) {
	const { config, settings } = field;
	const pageSize = settings?.max_items_per_page ?? 0;

	const [search, setSearch] = useState("");
	const [draftEntry, setDraftEntry] = useState("");
	const [page, setPage] = useState(1);
	// anker's SearchInput is uncontrolled, so clearing the filter means
	// remounting it. Bumping this token is version-proof where the
	// imperative SearchInputHandle is not (see search-combobox.tsx).
	const [searchToken, setSearchToken] = useState(0);

	return (
		<FormField
			name={config.api_accessor}
			label={config.name}
			helperText={config.instructions || undefined}
			required={config.required}
			readOnly={readOnly}
		>
			{(formField) => {
				const entries: string[] = Array.isArray(formField.value)
					? formField.value
					: [];

				const matches: PositionedEntry[] = entries
					.map((value, index) => ({ value, index }))
					.filter(
						({ value }) =>
							!search.trim() ||
							value.toLowerCase().includes(search.trim().toLowerCase()),
					);

				const totalPages =
					pageSize > 0 ? Math.max(1, Math.ceil(matches.length / pageSize)) : 1;
				// Derived rather than stored: removing entries can strand the page
				// beyond the end, and a clamped render beats an effect that
				// corrects it one paint later.
				const currentPage = Math.min(page, totalPages);
				const visible =
					pageSize > 0
						? matches.slice(
								(currentPage - 1) * pageSize,
								currentPage * pageSize,
							)
						: matches;

				const handleSearch = (next: string) => {
					setSearch(next);
					setPage(1);
				};

				const handleAdd = () => {
					const value = draftEntry.trim();
					if (!value) return;
					formField.onChange([...entries, value]);
					setDraftEntry("");
					// Show the form user where the entry landed. An active filter
					// would hide it (a new entry need not match), and the page it
					// went to is a page of the *unfiltered* list — so drop the
					// filter first, then page to the end.
					setSearch("");
					setSearchToken((token) => token + 1);
					setPage(
						pageSize > 0
							? Math.max(1, Math.ceil((entries.length + 1) / pageSize))
							: 1,
					);
				};

				const handleEdit = (index: number, value: string) => {
					const next = [...entries];
					next[index] = value;
					formField.onChange(next);
				};

				const handleRemove = (index: number) => {
					formField.onChange(entries.filter((_, i) => i !== index));
				};

				const handleMove = (index: number, delta: number) => {
					const target = index + delta;
					if (target < 0 || target >= entries.length) return;
					const next = [...entries];
					[next[index], next[target]] = [next[target], next[index]];
					formField.onChange(next);
				};

				return (
					<Box>
						{entries.length > 0 && (
							<Box mb="2">
								<SearchInput
									key={searchToken}
									aria-label="Search entries"
									placeholder="Search entries…"
									// Filtering an in-memory array costs nothing; the
									// default 300ms debounce only makes it feel laggy.
									debounceMs={0}
									size="sm"
									onSearch={handleSearch}
								/>
							</Box>
						)}

						{search.trim() && entries.length > 0 && (
							<Text fontSize="sm" color="fg.muted" mb="2">
								{`Showing ${matches.length} of ${entries.length} entries`}
							</Text>
						)}

						{entries.length === 0 && (
							<Text fontSize="sm" color="fg.muted" fontStyle="italic">
								No entries yet.
							</Text>
						)}

						{entries.length > 0 && matches.length === 0 && (
							<Text fontSize="sm" color="fg.muted" fontStyle="italic">
								No entries match your search.
							</Text>
						)}

						{/* Keyed by position in the stored array: entries are plain
						    strings with no identity of their own, and the position is
						    exactly what every mutation below addresses. */}
						{visible.map(({ value, index }) => (
							<Flex key={index} gap="1" mb="2" align="center">
								<Input
									size="sm"
									aria-label={`Entry ${index + 1}`}
									value={value}
									readOnly={readOnly}
									onChange={(e) => handleEdit(index, e.target.value)}
								/>
								{!readOnly && (
									<>
										<IconButton
											aria-label={`Move entry ${index + 1} up`}
											size="xs"
											variant="ghost"
											disabled={index === 0}
											onClick={() => handleMove(index, -1)}
										>
											<ChevronUp size={14} />
										</IconButton>
										<IconButton
											aria-label={`Move entry ${index + 1} down`}
											size="xs"
											variant="ghost"
											disabled={index === entries.length - 1}
											onClick={() => handleMove(index, 1)}
										>
											<ChevronDown size={14} />
										</IconButton>
										<IconButton
											aria-label={`Remove entry ${index + 1}`}
											size="xs"
											variant="ghost"
											onClick={() => handleRemove(index)}
										>
											<Trash2 size={14} />
										</IconButton>
									</>
								)}
							</Flex>
						))}

						{pageSize > 0 && matches.length > pageSize && (
							<Box mb="2">
								<Pagination
									page={currentPage}
									total={matches.length}
									pageSize={pageSize}
									onPageChange={setPage}
								/>
							</Box>
						)}

						{!readOnly && (
							<Flex gap="1" mt="2">
								<Input
									size="sm"
									aria-label="New entry"
									placeholder="New entry"
									value={draftEntry}
									onChange={(e) => setDraftEntry(e.target.value)}
									onKeyDown={(e) => {
										if (e.key !== "Enter") return;
										// The list usually sits inside the consumer's form;
										// Enter here means "add an entry", not "submit".
										e.preventDefault();
										handleAdd();
									}}
								/>
								<Button size="sm" variant="outline" onClick={handleAdd}>
									<Plus size={14} />
									Add entry
								</Button>
							</Flex>
						)}
					</Box>
				);
			}}
		</FormField>
	);
}
ListField.displayName = "ListField";
