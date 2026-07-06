import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldSearch } from "../field-search";
import type { FieldSearchResult } from "../search-index";

function result(accessor: string, label: string): FieldSearchResult {
	return { accessor, label, tabIndex: 0, tabLabel: "General" };
}

const THREE: FieldSearchResult[] = [
	result("alpha", "Alpha field"),
	result("beta", "Alpha beta"),
	result("gamma", "Alpha gamma"),
];

function renderSearch(
	index: FieldSearchResult[],
	onJump: (r: FieldSearchResult) => void = () => {},
) {
	return render(
		<ChakraProvider value={defaultSystem}>
			<FieldSearch
				index={index}
				placeholder="Find field…"
				noResultsLabel="No fields found"
				onJump={onJump}
			/>
		</ChakraProvider>,
	);
}

function input() {
	return screen.getByPlaceholderText("Find field…");
}

async function typeQuery(value: string) {
	fireEvent.change(input(), { target: { value } });
	// anker SearchInput debounces 300ms — wait for the dropdown.
	await waitFor(() => {
		expect(screen.getByRole("listbox")).toBeInTheDocument();
	});
}

describe("FieldSearch — combobox semantics", () => {
	it("wires role, expanded state, and controls linkage", async () => {
		renderSearch(THREE);
		const box = input();
		expect(box).toHaveAttribute("role", "combobox");
		expect(box).toHaveAttribute("aria-expanded", "false");
		expect(box).toHaveAttribute("aria-autocomplete", "list");
		expect(box).not.toHaveAttribute("aria-controls");

		await typeQuery("alpha");
		expect(box).toHaveAttribute("aria-expanded", "true");
		expect(box.getAttribute("aria-controls")).toBe(
			screen.getByRole("listbox").id,
		);
	});

	it("aria-activedescendant tracks the highlighted option through arrow keys", async () => {
		renderSearch(THREE);
		await typeQuery("alpha");
		const box = input();
		const options = screen.getAllByRole("option");

		expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
		expect(options[0]).toHaveAttribute("aria-selected", "true");

		fireEvent.keyDown(box, { key: "ArrowDown" });
		expect(box.getAttribute("aria-activedescendant")).toBe(options[1].id);
		expect(options[1]).toHaveAttribute("aria-selected", "true");
		expect(options[0]).toHaveAttribute("aria-selected", "false");

		fireEvent.keyDown(box, { key: "ArrowUp" });
		expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
	});

	it("clamps the highlight when the index prop shrinks mid-search (Enter still jumps)", async () => {
		const onJump = vi.fn();
		const { rerender } = renderSearch(THREE, onJump);
		await typeQuery("alpha");
		const box = input();

		fireEvent.keyDown(box, { key: "ArrowDown" });
		fireEvent.keyDown(box, { key: "ArrowDown" }); // highlighted = 2

		// Schema hot-swap: only one result remains, query text unchanged.
		rerender(
			<ChakraProvider value={defaultSystem}>
				<FieldSearch
					index={[result("alpha", "Alpha field")]}
					placeholder="Find field…"
					noResultsLabel="No fields found"
					onJump={onJump}
				/>
			</ChakraProvider>,
		);
		await waitFor(() => {
			expect(screen.getAllByRole("option")).toHaveLength(1);
		});
		// Pre-fix: highlighted (2) > last index (0) → Enter silently no-ops.
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onJump).toHaveBeenCalledWith(
			expect.objectContaining({ accessor: "alpha" }),
		);
	});

	it("clears aria-activedescendant when there are no results", async () => {
		renderSearch(THREE);
		fireEvent.change(input(), { target: { value: "zzz" } });
		await waitFor(() => {
			expect(screen.getByText("No fields found")).toBeInTheDocument();
		});
		expect(input()).not.toHaveAttribute("aria-activedescendant");
	});
});
