import {
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
	// Dotted accessor: the jump selector must CSS.escape it — an
	// unescaped `[data-field-row=meta.title]` selector matches nothing.
	makeField("meta.title", "Meta title"),
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
		// …and the escaped selector found the row: scrolled + flashing.
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
		await vi.advanceTimersByTimeAsync(400);
		// Scoped to the listbox — see the disambiguation note above.
		fireEvent.click(
			within(screen.getByRole("listbox")).getByText("Meta title"),
		);
		// Flush the jump's rAF (jsdom rAF is timer-backed under fake timers).
		await vi.advanceTimersByTimeAsync(50);

		// Unmount while the 1.5s flash timeout is pending, then advance past
		// it — the cleared timeout must not touch the detached node or warn;
		// reaching the end without throwing is the assertion.
		unmount();
		await vi.advanceTimersByTimeAsync(2000);
	});
});
