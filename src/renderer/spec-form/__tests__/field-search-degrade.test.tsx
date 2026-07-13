// src/renderer/spec-form/__tests__/field-search-degrade.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FieldSearch } from "../field-search";
import type { FieldSearchResult } from "../search-index";

// anker 3.1 simulation: plain FC, no forwardRef, ref spreads onto
// the DOM input (React 19 ref-as-prop) → searchRef.current is an
// HTMLInputElement with no clear().
vi.mock("@knkcs/anker/forms", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@knkcs/anker/forms")>();
	return {
		...actual,
		SearchInput: (props: Record<string, unknown>) => {
			const { onSearch, ...rest } = props as {
				onSearch: (q: string) => void;
			} & Record<string, unknown>;
			return (
				<input
					{...(rest as object)}
					onChange={(e) => onSearch(e.target.value)}
				/>
			);
		},
	};
});

function result(accessor: string, label: string): FieldSearchResult {
	return { accessor, label, tabIndex: 0, tabLabel: "General" };
}

const THREE: FieldSearchResult[] = [
	result("alpha", "Alpha field"),
	result("beta", "Alpha beta"),
	result("gamma", "Alpha gamma"),
];

function renderSearch(onJump: (r: FieldSearchResult) => void = () => {}) {
	return render(
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
}

function input() {
	return screen.getByPlaceholderText("Find field…");
}

describe("FieldSearch — anker 3.1 degrade (ref lands on raw <input>, no clear())", () => {
	it("jumps on Enter without throwing even though the ref has no clear()", () => {
		const onJump = vi.fn();
		renderSearch(onJump);

		// The mocked SearchInput is non-debounced, so the dropdown is open
		// synchronously after the change event — no waitFor needed.
		fireEvent.change(input(), { target: { value: "alpha" } });
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		expect(() => {
			fireEvent.keyDown(input(), { key: "Enter" });
		}).not.toThrow();
		expect(onJump).toHaveBeenCalledWith(
			expect.objectContaining({ accessor: "alpha" }),
		);
	});

	it("Escape clears the query and closes the dropdown without throwing", async () => {
		renderSearch();

		fireEvent.change(input(), { target: { value: "alpha" } });
		expect(screen.getByRole("listbox")).toBeInTheDocument();

		expect(() => {
			fireEvent.keyDown(input(), { key: "Escape" });
		}).not.toThrow();
		// waitFor: teardown can defer past the dispatch under load (fieldkit#39).
		await waitFor(() => {
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		});
	});
});
