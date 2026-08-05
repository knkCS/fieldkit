// src/renderer/spec-form/__tests__/field-search-shortcut.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldSearch } from "../field-search";
import type { FieldSearchResult } from "../search-index";

const INDEX: FieldSearchResult[] = [
	{ accessor: "title", label: "Title", tabIndex: 0, tabLabel: "General" },
];

function renderSearch() {
	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldSearch
				index={INDEX}
				placeholder="Find field…"
				noResultsLabel="No fields found"
				label="Find field"
				onJump={() => {}}
			/>
		</ChakraProvider>,
	);
}

function input() {
	return screen.getByPlaceholderText("Find field…");
}

describe("FieldSearch — the '/' shortcut is the caller's to claim", () => {
	// The shared field-shaped caller must not claim the shortcut on its
	// callers' behalf. The opposite direction — that asking for it works —
	// is covered where it is actually asked for: SpecForm (both modes) and
	// the editor canvas.
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
});
