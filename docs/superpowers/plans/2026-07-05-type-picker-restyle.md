# TypePicker Restyle + Label Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild TypePicker on Chakra/anker tokens (deleting all inline CSS) and route its strings — including category headings and a new at-max explanation — through optional labels fed from `EditorLabels`.

**Architecture:** `TypePicker` keeps its exact layout and behavior (non-debounced search, context filter, maxPerSpec disabling, testids) but renders via Chakra primitives; gains optional `labels?: TypePickerLabels` merged over exported `DEFAULT_TYPE_PICKER_LABELS`. `EditorLabels`/`DEFAULT_EDITOR_LABELS` gain the type-picker keys; `CanvasLabels` + `TypePickerPopover` thread them.

**Tech Stack:** Chakra v3 primitives, anker semantic tokens, anker `Tooltip` (/primitives), Vitest/RTL.

**Spec:** docs/superpowers/specs/2026-07-05-type-picker-restyle-design.md

## Global Constraints

- Non-breaking public API: `labels` optional, English defaults; existing `TypePickerProps` fields unchanged; `data-testid="type-picker"` and `data-testid="type-option-<id>"` preserved.
- Search stays controlled and NON-debounced (do not use anker `SearchInput`).
- Zero `style={{…}}` remains in type-picker.tsx. anker tokens only (`border`, `bg-surface`, `bg-subtle`, `bg-muted`, `fg.muted`, `fg.subtle`).
- Conventional Commits, scope `editor`. Full gate before commit: `npm run test && npm run typecheck && npm run lint`.

---

### Task 1: restyle + labels

**Files:**
- Modify: `src/editor/type-picker.tsx` (full rewrite of the render; logic hooks unchanged)
- Modify: `src/editor/type-picker-popover.tsx` (thread `labels`)
- Modify: `src/editor/editor-canvas.tsx` (CanvasLabels Pick gains the new keys; pass to popover)
- Modify: `src/editor/spec-editor.tsx` (EditorLabels + DEFAULT_EDITOR_LABELS gain the keys)
- Modify: `src/editor/index.ts` (export `TypePickerLabels`, `DEFAULT_TYPE_PICKER_LABELS`)
- Modify: `src/editor/spec-editor.mdx` (labels table rows; remove the TypePicker Known Limitations entry)
- Test: `src/editor/__tests__/type-picker.test.tsx` (extend)

**Interfaces — produces:**

```ts
export interface TypePickerLabels {
	searchPlaceholder?: string;
	searchLabel?: string;
	noMatches?: string;
	/** Tooltip/title on disabled at-max cards; "{max}" interpolated. */
	maxReached?: string;
	categories?: Partial<Record<FieldTypeCategory, string>>;
}
export const DEFAULT_TYPE_PICKER_LABELS: Required<TypePickerLabels> = {
	searchPlaceholder: "Search field types...",
	searchLabel: "Search field types",
	noMatches: "No matching field types",
	maxReached: "Limit reached (max {max})",
	categories: {
		text: "Text", number: "Number", date: "Date", selection: "Selection",
		boolean: "Boolean", structural: "Structural", reference: "Reference",
		media: "Media",
	},
};
// TypePickerProps gains: labels?: TypePickerLabels
```

`EditorLabels` gains `typeSearchPlaceholder?`, `typeSearchLabel?`, `typeNoMatches?`, `typeMaxReached?`, `typeCategories?: Partial<Record<FieldTypeCategory, string>>` — defaults in `DEFAULT_EDITOR_LABELS` mirror the values above. `CanvasLabels`' `Pick<...>` union gains the five keys; the canvas passes them to `TypePickerPopover` as a `pickerLabels` prop (type `TypePickerLabels`, built inline: `{ searchPlaceholder: labels.typeSearchPlaceholder, searchLabel: labels.typeSearchLabel, noMatches: labels.typeNoMatches, maxReached: labels.typeMaxReached, categories: labels.typeCategories }`), which the popover forwards as `labels` to `TypePicker`.

- [ ] **Step 1: Write the failing tests** — append to `src/editor/__tests__/type-picker.test.tsx` (reuse its existing plugin fixtures; add a maxPerSpec:1 fixture if none exists):

```tsx
describe("TypePicker labels", () => {
	it("renders custom labels: placeholder, aria-label, empty state, category heading", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={plugins}
					onSelect={noop}
					labels={{
						searchPlaceholder: "Feldtyp suchen…",
						searchLabel: "Feldtypsuche",
						noMatches: "Keine Treffer",
						categories: { text: "Texte" },
					}}
				/>
			</ChakraProvider>,
		);
		expect(screen.getByPlaceholderText("Feldtyp suchen…")).toBeInTheDocument();
		expect(screen.getByLabelText("Feldtypsuche")).toBeInTheDocument();
		expect(screen.getByText("Texte")).toBeInTheDocument(); // translated heading
		fireEvent.change(screen.getByLabelText("Feldtypsuche"), { target: { value: "zzz" } });
		expect(screen.getByText("Keine Treffer")).toBeInTheDocument();
	});

	it("Title-cases category headings by default", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker plugins={plugins} onSelect={noop} />
			</ChakraProvider>,
		);
		expect(screen.getByText("Text")).toBeInTheDocument();
		expect(screen.queryByText("text")).not.toBeInTheDocument();
	});

	it("at-max cards carry the interpolated maxReached explanation", () => {
		// maxOnePlugin: a fixture with maxPerSpec: 1; currentSpec containing one instance
		render(
			<ChakraProvider value={defaultSystem}>
				<TypePicker
					plugins={[maxOnePlugin]}
					currentSpec={[fieldOfType(maxOnePlugin.id)]}
					onSelect={noop}
				/>
			</ChakraProvider>,
		);
		const card = screen.getByTestId(`type-option-${maxOnePlugin.id}`);
		expect(card).toBeDisabled();
		expect(card).toHaveAttribute("title", "Limit reached (max 1)");
	});
});
```

(Existing tests in the file render WITHOUT ChakraProvider — the restyle makes Chakra context mandatory, so wrap the existing renders too; that is the only sanctioned edit to them. Assertions stay untouched. Category-heading assertions in old tests, if any assert lowercase raw values, must be updated to the Title-case defaults — that is a spec-mandated behavior change.)

- [ ] **Step 2: RED** — `npx vitest run src/editor/__tests__/type-picker.test.tsx` → new tests fail (no labels prop / lowercase headings / no title attr).

- [ ] **Step 3: Rewrite the render.** Keep `countByType`, all three `useMemo`s, and the state hook byte-identical. New imports: `{ Box, Grid, Input, InputGroup, Stack, Text } from "@chakra-ui/react"`, `{ Tooltip } from "@knkcs/anker/primitives"`. Merge labels once: `const l = { ...DEFAULT_TYPE_PICKER_LABELS, ...labels, categories: { ...DEFAULT_TYPE_PICKER_LABELS.categories, ...labels?.categories } };` Render:

```tsx
	return (
		<Stack gap="3" data-testid="type-picker">
			<InputGroup startElement={<Search size={16} />}>
				<Input
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					placeholder={l.searchPlaceholder}
					aria-label={l.searchLabel}
					size="sm"
				/>
			</InputGroup>

			{Array.from(grouped.entries()).map(([category, categoryPlugins]) => (
				<Box key={category}>
					<Text
						fontSize="xs"
						fontWeight="semibold"
						textTransform="uppercase"
						letterSpacing="wider"
						color="fg.muted"
						mb="2"
					>
						{l.categories[category] ?? category}
					</Text>
					<Grid templateColumns="repeat(auto-fill, minmax(180px, 1fr))" gap="2">
						{categoryPlugins.map((plugin) => {
							const count = typeCounts.get(plugin.id) ?? 0;
							const isAtMax =
								plugin.maxPerSpec !== undefined && count >= plugin.maxPerSpec;
							const Icon = plugin.icon;
							const maxTitle = l.maxReached.replace(
								"{max}",
								String(plugin.maxPerSpec ?? 0),
							);
							const card = (
								<Box
									key={plugin.id}
									as="button"
									type="button"
									data-testid={`type-option-${plugin.id}`}
									disabled={isAtMax}
									title={isAtMax ? maxTitle : undefined}
									onClick={() => onSelect(plugin.id)}
									display="flex"
									alignItems="flex-start"
									gap="2"
									p="2.5"
									borderWidth="1px"
									borderColor="border"
									borderRadius="md"
									bg={isAtMax ? "bg-subtle" : "bg-surface"}
									opacity={isAtMax ? 0.5 : 1}
									cursor={isAtMax ? "not-allowed" : "pointer"}
									textAlign="left"
									width="100%"
									_hover={isAtMax ? undefined : { bg: "bg-muted" }}
									_focusVisible={{ outline: "2px solid", outlineColor: "accent", outlineOffset: "1px" }}
								>
									<Box as="span" flexShrink={0} mt="0.5">
										<Icon size={18} />
									</Box>
									<Stack gap="0.5">
										<Text fontWeight="medium" fontSize="sm">{plugin.name}</Text>
										<Text fontSize="xs" color="fg.muted">{plugin.description}</Text>
									</Stack>
								</Box>
							);
							return isAtMax ? (
								<Tooltip key={plugin.id} content={maxTitle}>
									{card}
								</Tooltip>
							) : (
								card
							);
						})}
					</Grid>
				</Box>
			))}

			{grouped.size === 0 && (
				<Text color="fg.subtle" textAlign="center" p="4">
					{l.noMatches}
				</Text>
			)}
		</Stack>
	);
```

Notes: `Tooltip` on a disabled element — anker's Tooltip wraps via `Trigger asChild`; if the disabled button swallows pointer events and the tooltip never opens in the browser, wrap the card in a `<Box as="span" display="contents">` inside the Tooltip instead; the `title` attribute is the tested fallback either way. Key stays on the outermost rendered element per branch.

- [ ] **Step 4: Thread the labels.**
- `type-picker-popover.tsx`: props gain `pickerLabels?: TypePickerLabels`; pass `labels={pickerLabels}` to `<TypePicker>`.
- `editor-canvas.tsx`: `CanvasLabels`'s `Pick<...>` union gains `"typeSearchPlaceholder" | "typeSearchLabel" | "typeNoMatches" | "typeMaxReached" | "typeCategories"`; both `TypePickerPopover` call sites pass `pickerLabels={{ searchPlaceholder: labels.typeSearchPlaceholder, searchLabel: labels.typeSearchLabel, noMatches: labels.typeNoMatches, maxReached: labels.typeMaxReached, categories: labels.typeCategories }}`.
- `spec-editor.tsx`: `EditorLabels` gains the five optional keys (typeCategories typed `Partial<Record<FieldTypeCategory, string>>`); `DEFAULT_EDITOR_LABELS` gains the default values (same strings/casing as `DEFAULT_TYPE_PICKER_LABELS`).
- `index.ts`: export `TypePickerLabels`, `DEFAULT_TYPE_PICKER_LABELS` alongside the existing TypePicker exports.

- [ ] **Step 5: Docs.** `spec-editor.mdx`: add the five keys to the labels table (typeCategories documented as a map with the 8 category keys); delete the Known Limitations bullet about TypePicker's unrouted strings. Verify no other Known Limitations text references TypePicker styling.

- [ ] **Step 6: GREEN + full gate**

```bash
npx vitest run src/editor/
npm run test && npm run typecheck && npm run lint
```
Expected: all pass; grep confirms zero `style={{` left in type-picker.tsx.

- [ ] **Step 7: Commit**

```bash
git add src/editor/ 
git commit -m "feat(editor): restyle TypePicker with tokens and label routing"
```

Runtime verification (controller): Storybook Build story — open the ⊕ popover; confirm token styling, hover state, Title-case headings, and an at-max tooltip if reachable.
