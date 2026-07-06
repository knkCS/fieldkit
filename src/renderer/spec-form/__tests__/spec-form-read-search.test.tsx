import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

// jsdom has no scrollIntoView.
beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
	vi.useRealTimers();
});

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	// Dotted accessor. Note: the jump's QUOTED attribute selector already
	// tolerates a literal dot — CSS.escape there is defensive hardening
	// for characters that would break a quoted selector (`"`, `\`), so
	// this fixture pins the jump MECHANISM with a realistic nested
	// accessor, not the escaping itself.
	makeField("meta.title", "Meta title"),
	// A second SEO field, distinct from meta.title, so a test can jump to
	// one and then the other within the same tab — proving the flash
	// clobber fix (a second jump must clean up the FIRST row's ring, not
	// just apply a new one to the second).
	makeField("meta.description", "Meta description"),
];

function renderRead() {
	return render(
		<Wrapper>
			<SpecForm schema={schema} mode="read" values={{}} />
		</Wrapper>,
	);
}

describe("SpecForm read mode — search parity", () => {
	it("focuses the search on '/' when no input is focused", () => {
		renderRead();
		fireEvent.keyDown(document, { key: "/" });
		expect(screen.getByPlaceholderText("Find field…")).toHaveFocus();
	});

	it("jumps cross-tab to a dotted accessor: switches tab, scrolls, flashes", async () => {
		renderRead();
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		// ReadTab keeps every tab's rows permanently mounted (RHF-derived
		// TabShell contract, see tab-shell.tsx) — including the SEO tab's own
		// "Meta title" row label, which is not the search result. Scope to
		// the results listbox so the click can't land on that row instead
		// (same disambiguation as field-search.test.tsx's "SEO"/"Photo" cases).
		const listbox = await screen.findByRole("listbox");
		const option = within(listbox).getByText("Meta title");
		fireEvent.click(option);

		// Tab switched to SEO…
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
		// …and the jump found the row: scrolled + flashing.
		await waitFor(() => {
			const row = document.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape("meta.title")}"]`,
			);
			expect(row).not.toBeNull();
			expect(row?.style.boxShadow).toContain("3px");
		});
		expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
	});

	it("clears the flash and survives unmount with a pending flash timeout", async () => {
		vi.useFakeTimers();
		const { unmount } = renderRead();
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		// Debounce (300ms) then let the dropdown render.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(400);
		});
		// Scoped to the listbox — see the disambiguation note above.
		fireEvent.click(
			within(screen.getByRole("listbox")).getByText("Meta title"),
		);
		// Flush the jump's rAF (jsdom rAF is timer-backed under fake timers).
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});

		// Unmount while the 1.5s flash timeout is pending, then advance past
		// it — the cleared timeout must not touch the detached node or warn;
		// reaching the end without throwing is the assertion.
		unmount();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
	});

	it("cleans up the previous row's ring when a second jump lands within the fade window", async () => {
		vi.useFakeTimers();
		renderRead();

		const rowFor = (accessor: string) =>
			document.querySelector<HTMLElement>(
				`[data-field-row="${CSS.escape(accessor)}"]`,
			);

		// First jump: "meta" -> "Meta title".
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(400);
		});
		fireEvent.click(
			within(screen.getByRole("listbox")).getByText("Meta title"),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});
		expect(rowFor("meta.title")?.style.boxShadow).toContain("3px");

		// Second jump, well within the 1.5s fade window, to a DIFFERENT
		// field: "meta" -> "Meta description".
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		await act(async () => {
			await vi.advanceTimersByTimeAsync(400);
		});
		fireEvent.click(
			within(screen.getByRole("listbox")).getByText("Meta description"),
		);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});

		// The second row now carries the ring...
		expect(rowFor("meta.description")?.style.boxShadow).toContain("3px");
		// ...and the first row's ring must have been cleaned up, not left
		// forever — this is the clobber bug.
		const firstRowShadow = rowFor("meta.title")?.style.boxShadow;
		expect(firstRowShadow === "none" || firstRowShadow === "").toBe(true);
	});
});
