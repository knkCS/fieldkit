// src/editor/field-settings/list-settings.tsx
import { Box, Input, Text } from "@chakra-ui/react";
import type { ChangeEvent } from "react";
import type { ListSettings } from "../../schema/field-types/list";
import type { SettingsProps } from "../../schema/plugin";

/**
 * Type-settings editor for `list`, mounted by the config panel's Type
 * settings tab. It lives in the editor layer for the same reason a plugin's
 * field component lives in the renderer and its cell in the table: `/schema`
 * carries no React of its own (CLAUDE.md, Architecture).
 *
 * Styled to match `panel-sections/validation-section.tsx` — the panel's other
 * numeric inputs — rather than introducing a second look for one field type.
 */
export function ListSettingsEditor({
	settings,
	onChange,
}: SettingsProps<ListSettings>) {
	const maxItemsPerPage = settings?.max_items_per_page ?? 0;

	function handleMaxItemsPerPage(e: ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value;
		const parsed = raw === "" ? 0 : Number(raw);
		onChange({
			...settings,
			max_items_per_page: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
		});
	}

	return (
		<Box>
			{/* The helper sits outside the <label> on purpose: a label wraps its
			    descendants into the input's accessible name, and "Entries per
			    page Leave empty to show every entry on one page." is not a name. */}
			<Box as="label" display="block">
				<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
					Entries per page
				</Text>
				<Input
					size="sm"
					mt="1"
					type="number"
					min={0}
					value={maxItemsPerPage === 0 ? "" : maxItemsPerPage}
					onChange={handleMaxItemsPerPage}
					placeholder="All on one page"
					data-testid="list-max-items-per-page-input"
				/>
			</Box>
			<Text fontSize="xs" color="fg.muted" mt="1">
				Leave empty to show every entry on one page.
			</Text>
		</Box>
	);
}
ListSettingsEditor.displayName = "ListSettingsEditor";
