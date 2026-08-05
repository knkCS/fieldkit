// src/renderer/__tests__/search-combobox.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchCombobox } from "../search-combobox";

// A result shape with nothing Field-shaped about it — no accessor, no tab —
// standing in for what Find (#143) will list: a Reference row keyed by its
// index path, named by the Content it points at, placed by its ancestors.
interface Row {
	path: string;
	name: string;
	ancestors: string;
}

const ROWS: Row[] = [
	{ path: "0", name: "Aluminium", ancestors: "Materials" },
	{ path: "1.2", name: "Aluminium foil", ancestors: "Materials › Packaging" },
	{ path: "3", name: "Copper", ancestors: "Materials" },
];

function matches(query: string): Row[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];
	return ROWS.filter((r) => r.name.toLowerCase().includes(q));
}

/** A caller that lists everything it found, and says nothing about counts. */
function search(query: string) {
	return { results: matches(query) };
}

function renderCombobox(
	overrides: Partial<React.ComponentProps<typeof SearchCombobox<Row>>> = {},
) {
	return render(
		<ChakraProvider value={defaultSystem}>
			<SearchCombobox<Row>
				search={search}
				describeResult={(r) => ({
					key: r.path,
					label: r.name,
					secondary: r.ancestors,
				})}
				onSelect={() => {}}
				placeholder="Find reference…"
				noResultsLabel="No references found"
				label="Find reference"
				{...overrides}
			/>
		</ChakraProvider>,
	);
}

function input() {
	return screen.getByPlaceholderText("Find reference…");
}

async function typeQuery(value: string) {
	fireEvent.change(input(), { target: { value } });
	// anker's SearchInput debounces onSearch by 300ms.
	await waitFor(() => {
		expect(screen.getByRole("listbox")).toBeInTheDocument();
	});
}

describe("SearchCombobox — lists a caller-supplied result shape", () => {
	it("renders one option per result the caller's search returned", async () => {
		renderCombobox();
		await typeQuery("alumin");
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(2);
		expect(options[0]).toHaveTextContent("Aluminium");
		expect(options[1]).toHaveTextContent("Aluminium foil");
	});

	it("hands the caller back its own result object on select", async () => {
		const onSelect = vi.fn();
		renderCombobox({ onSelect });
		await typeQuery("copper");
		fireEvent.click(screen.getByRole("option"));
		// The caller's own object, not a shape the combobox invented.
		expect(onSelect).toHaveBeenCalledWith(ROWS[2]);
	});

	it("selects the highlighted result on Enter", async () => {
		const onSelect = vi.fn();
		renderCombobox({ onSelect });
		await typeQuery("alumin");
		fireEvent.keyDown(input(), { key: "ArrowDown" });
		fireEvent.keyDown(input(), { key: "Enter" });
		expect(onSelect).toHaveBeenCalledWith(ROWS[1]);
	});
});

describe("SearchCombobox — the count beside the list", () => {
	/** A caller that caps its list at one, and says how many it really found. */
	function cappedSearch(query: string) {
		const found = matches(query);
		return {
			results: found.slice(0, 1),
			countLabel: found.length > 1 ? `1 of ${found.length} matches` : "1 match",
		};
	}

	it("shows the count its caller's answer carried", async () => {
		renderCombobox({ search: cappedSearch });
		await typeQuery("alumin");

		// One option listed, and the label naming the two that were found —
		// both out of the one answer, so they cannot disagree.
		expect(screen.getAllByRole("option")).toHaveLength(1);
		expect(screen.getByText("1 of 2 matches")).toBeInTheDocument();
	});

	it("announces the count, for a reader that never sees the list", async () => {
		renderCombobox({ search: cappedSearch });
		await typeQuery("alumin");

		expect(screen.getByRole("status")).toHaveTextContent("1 of 2 matches");
	});

	it("shows no count for a caller whose answer carries none", async () => {
		// The form's own field search lists everything it found; a count line
		// there would be a screen nobody asked to change.
		renderCombobox();
		await typeQuery("alumin");

		expect(screen.getAllByRole("option")).toHaveLength(2);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("leaves the count off when nothing matched, where the no-results line speaks", async () => {
		renderCombobox({ search: cappedSearch });
		fireEvent.change(input(), { target: { value: "titanium" } });

		expect(await screen.findByText("No references found")).toBeInTheDocument();
		// Not "1 match" beside an empty list: two lines answering one question
		// is how they come to disagree.
		expect(screen.queryByText("1 match")).not.toBeInTheDocument();
	});
});

describe("SearchCombobox — two-line results", () => {
	it("renders the secondary line as its own element after the label", async () => {
		renderCombobox({ layout: "stacked" });
		await typeQuery("alumin");
		const option = screen.getAllByRole("option")[1];
		const label = within(option).getByText("Aluminium foil");
		const secondary = within(option).getByText("Materials › Packaging");
		expect(secondary).not.toBe(label);
		// The secondary line follows the label, so a reader announcing the
		// option reads the name before the path that places it.
		expect(
			label.compareDocumentPosition(secondary) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(option).toHaveAttribute("data-layout", "stacked");
	});

	it("keeps the secondary on the same line by default", async () => {
		renderCombobox();
		await typeQuery("alumin");
		expect(screen.getAllByRole("option")[0]).toHaveAttribute(
			"data-layout",
			"inline",
		);
	});

	it("omits the secondary element entirely when the caller supplies none", async () => {
		renderCombobox({
			describeResult: (r: Row) => ({ key: r.path, label: r.name }),
		});
		await typeQuery("copper");
		const option = screen.getByRole("option");
		expect(option).toHaveTextContent("Copper");
		expect(within(option).queryByText("Materials")).not.toBeInTheDocument();
		// Not merely empty — absent, so a reader finds nothing to announce
		// after the label.
		expect(option.children).toHaveLength(1);
	});
});

describe("SearchCombobox — the '/' shortcut is opt-in", () => {
	// Direct assertion, not inferred from a keypress that did nothing: a
	// caller that does not opt in must not put a key listener on document or
	// window, so a Find combobox inside a form can never race the form's own
	// search.
	function keydownSpies() {
		const onDocument = vi.spyOn(document, "addEventListener");
		const onWindow = vi.spyOn(window, "addEventListener");
		const keydowns = (spy: typeof onDocument) =>
			spy.mock.calls.filter(([type]) => type === "keydown");
		return {
			onDocument: () => keydowns(onDocument),
			onWindow: () => keydowns(onWindow),
			all: () => [...keydowns(onDocument), ...keydowns(onWindow)],
			restore: () => {
				onDocument.mockRestore();
				onWindow.mockRestore();
			},
		};
	}

	it("registers no document- or window-level key listener when not opted in", () => {
		const spies = keydownSpies();
		try {
			renderCombobox();
			expect(spies.all()).toHaveLength(0);
		} finally {
			spies.restore();
		}
	});

	// The state Find spends its life in: dropdown open, shortcut not claimed.
	// The Escape containment is a window listener and is meant to be there —
	// but it is scoped to this node, and nothing lands on `document`, where
	// the "/" claim would go.
	it("adds nothing on document once its dropdown opens, and only the Escape containment on window", async () => {
		const spies = keydownSpies();
		try {
			renderCombobox();
			await typeQuery("alumin");
			expect(spies.onDocument()).toHaveLength(0);
			const onWindow = spies.onWindow();
			expect(onWindow).toHaveLength(1);
			// Capture phase — the containment, not a shortcut claim.
			expect(onWindow[0][2]).toBe(true);
		} finally {
			spies.restore();
		}
		fireEvent.keyDown(document.body, { key: "/" });
		expect(input()).not.toHaveFocus();
	});

	it("registers exactly one document-level keydown listener when opted in", () => {
		const spies = keydownSpies();
		try {
			const { unmount } = renderCombobox({ slashShortcut: true });
			expect(spies.all()).toHaveLength(1);
			expect(spies.onDocument()).toHaveLength(1);
			const removed = vi.spyOn(document, "removeEventListener");
			unmount();
			expect(
				removed.mock.calls.filter(([type]) => type === "keydown"),
			).toHaveLength(1);
			removed.mockRestore();
		} finally {
			spies.restore();
		}
	});

	it("leaves '/' alone when not opted in", () => {
		renderCombobox();
		fireEvent.keyDown(document.body, { key: "/" });
		expect(input()).not.toHaveFocus();
	});

	it("focuses the input on '/' when opted in", async () => {
		renderCombobox({ slashShortcut: true });
		fireEvent.keyDown(document.body, { key: "/" });
		await waitFor(() => {
			expect(input()).toHaveFocus();
		});
	});

	it("ignores '/' typed into another text input, even when opted in", () => {
		renderCombobox({ slashShortcut: true });
		const other = document.createElement("input");
		document.body.appendChild(other);
		other.focus();
		fireEvent.keyDown(other, { key: "/" });
		expect(input()).not.toHaveFocus();
		expect(other).toHaveFocus();
		other.remove();
	});
});
