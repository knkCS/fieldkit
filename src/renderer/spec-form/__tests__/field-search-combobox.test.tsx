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
				label="Find field"
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
					label="Find field"
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

	it("recovers after arrowing on an empty result set when results grow back", async () => {
		const onJump = vi.fn();
		const { rerender } = renderSearch(THREE, onJump);
		await typeQuery("alpha");

		// Shrink to zero matches (query text unchanged) — dropdown stays
		// open showing the no-results row.
		rerender(
			<ChakraProvider value={defaultSystem}>
				<FieldSearch
					index={[]}
					placeholder="Find field…"
					noResultsLabel="No fields found"
					label="Find field"
					onJump={onJump}
				/>
			</ChakraProvider>,
		);
		await waitFor(() => {
			expect(screen.getByText("No fields found")).toBeInTheDocument();
		});
		// Pre-fix this stores highlighted = -1.
		fireEvent.keyDown(input(), { key: "ArrowDown" });

		// Grow the results back without changing the query.
		rerender(
			<ChakraProvider value={defaultSystem}>
				<FieldSearch
					index={THREE}
					placeholder="Find field…"
					noResultsLabel="No fields found"
					label="Find field"
					onJump={onJump}
				/>
			</ChakraProvider>,
		);
		await waitFor(() => {
			expect(screen.getAllByRole("option")).toHaveLength(3);
		});
		expect(input().getAttribute("aria-activedescendant")).toBe(
			screen.getAllByRole("option")[0].id,
		);
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onJump).toHaveBeenCalledWith(
			expect.objectContaining({ accessor: "alpha" }),
		);
	});

	it("uses the label prop as the input's accessible name", async () => {
		renderSearch(THREE);
		expect(screen.getByLabelText("Find field")).toBe(input());
	});

	it("announces the empty state and keeps the listbox mounted", async () => {
		renderSearch(THREE);
		fireEvent.change(input(), { target: { value: "zzz" } });
		await waitFor(() => {
			expect(screen.getByText("No fields found")).toBeInTheDocument();
		});
		// The no-results text lives OUTSIDE the listbox, in a status region…
		expect(screen.getByRole("status")).toHaveTextContent("No fields found");
		// …while the (empty) listbox stays mounted so aria-controls stays valid.
		const listbox = screen.getByRole("listbox");
		expect(listbox.querySelectorAll('[role="option"]')).toHaveLength(0);
		expect(input().getAttribute("aria-controls")).toBe(listbox.id);
	});

	it("clears the visible input text after a jump", async () => {
		const onJump = vi.fn();
		renderSearch(THREE, onJump);
		await typeQuery("alpha");
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onJump).toHaveBeenCalled();
		expect((input() as HTMLInputElement).value).toBe("");
	});
});
