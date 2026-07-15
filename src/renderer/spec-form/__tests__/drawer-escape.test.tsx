// src/renderer/spec-form/__tests__/drawer-escape.test.tsx
import { DrawerRoot } from "@knkcs/anker/components";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

// anker's Drawer positions via floating-ui → needs ResizeObserver in jsdom.
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm search inside a real DrawerRoot", () => {
	it("Escape closes only the dropdown; a second Escape closes the drawer", async () => {
		const onClose = vi.fn();
		render(
			<Wrapper>
				<DrawerRoot open onClose={onClose} title="Edit">
					<SpecForm schema={schema} />
				</DrawerRoot>
			</Wrapper>,
		);

		const input = screen.getByPlaceholderText("Find field…");
		fireEvent.change(input, { target: { value: "meta" } });
		await waitFor(() => {
			expect(screen.getByRole("listbox")).toBeInTheDocument();
		});

		// Escape #1: contained by FieldSearch — dropdown closes, drawer lives.
		fireEvent.keyDown(input, { key: "Escape" });
		// Generous timeout: the zag teardown exceeded waitFor's 1s default once
		// under CI runner load (v0.9.0 publish run) — same flake class as the
		// field-search deflake (fieldkit#39).
		await waitFor(
			() => {
				expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
			},
			{ timeout: 5000 },
		);
		expect(onClose).not.toHaveBeenCalled();

		// Escape #2 (dropdown closed): FieldSearch's handler early-returns,
		// the key propagates, the drawer closes.
		fireEvent.keyDown(input, { key: "Escape" });
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
		});
		// Generous TEST timeout (#39 flake class, 4th instance 2026-07-15:
		// the 53db1d7 waitFor headroom now exceeds vitest's 5s TEST budget
		// under CI load — the failure just moved up a level). The awaits
		// pass; they're slow on a loaded runner.
	}, 15000);

	it("does not swallow Escape aimed outside the search UI while the dropdown is open", async () => {
		const onClose = vi.fn();
		render(
			<Wrapper>
				<DrawerRoot open onClose={onClose} title="Edit">
					<SpecForm schema={schema} />
				</DrawerRoot>
			</Wrapper>,
		);
		const input = screen.getByPlaceholderText("Find field…");
		fireEvent.change(input, { target: { value: "meta" } });
		await waitFor(() => {
			expect(screen.getByRole("listbox")).toBeInTheDocument();
		});

		// Escape targeted at an element OUTSIDE the search box (the drawer
		// body): the scoped listener must let it through — the drawer closes
		// even though a dropdown was left open.
		fireEvent.keyDown(document.body, { key: "Escape" });
		await waitFor(() => {
			expect(onClose).toHaveBeenCalledTimes(1);
		});
	});
});
