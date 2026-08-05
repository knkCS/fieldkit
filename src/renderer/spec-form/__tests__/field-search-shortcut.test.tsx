// src/renderer/spec-form/__tests__/field-search-shortcut.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldSearch } from "../field-search";
import type { FieldSearchResult } from "../search-index";

const INDEX: FieldSearchResult[] = [
	{ accessor: "title", label: "Title", tabIndex: 0, tabLabel: "General" },
];

function renderSearch(slashShortcut?: boolean) {
	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldSearch
				index={INDEX}
				placeholder="Find field…"
				noResultsLabel="No fields found"
				label="Find field"
				onJump={() => {}}
				slashShortcut={slashShortcut}
			/>
		</ChakraProvider>,
	);
}

function input() {
	return screen.getByPlaceholderText("Find field…");
}

describe("FieldSearch — the '/' shortcut is the caller's to claim", () => {
	// The shortcut is first-mounted-wins, so a search that claims it without
	// being asked to takes it from whichever search the Author meant. Two
	// callers ask (SpecForm's field search, the editor canvas); every other
	// mount — Find inside a form, above all — must register nothing.
	it("registers no document- or window-level key listener by default", () => {
		const onDocument = vi.spyOn(document, "addEventListener");
		const onWindow = vi.spyOn(window, "addEventListener");
		try {
			renderSearch();
			expect(
				[...onDocument.mock.calls, ...onWindow.mock.calls].filter(
					([type]) => type === "keydown",
				),
			).toHaveLength(0);
		} finally {
			onDocument.mockRestore();
			onWindow.mockRestore();
		}
		fireEvent.keyDown(document.body, { key: "/" });
		expect(input()).not.toHaveFocus();
	});

	it("focuses the input on '/' once a caller opts in", async () => {
		renderSearch(true);
		fireEvent.keyDown(document.body, { key: "/" });
		await waitFor(() => {
			expect(input()).toHaveFocus();
		});
	});
});
