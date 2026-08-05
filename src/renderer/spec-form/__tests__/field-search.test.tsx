import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SpecForm } from "../spec-form";
import {
	makeDisabledFirstField,
	makeField,
	makePickerField,
	makeSection,
	Wrapper,
} from "./helpers";
import { asSoonAsRendered } from "./render-timing";

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm — field search", () => {
	it("renders no search for sectionless schemas", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a")]} />
			</Wrapper>,
		);
		expect(
			screen.queryByPlaceholderText("Find field…"),
		).not.toBeInTheDocument();
	});

	it("lists matches with their tab label", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		expect(await screen.findByText("Meta description")).toBeInTheDocument();
		// "SEO" is ambiguous against the always-mounted tab trigger of the
		// same name, so scope the match to the search results listbox.
		const listbox = screen.getByRole("listbox");
		expect(within(listbox).getByText("SEO")).toBeInTheDocument();
	});

	it("shows the no-results row", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "zzz" },
		});
		expect(await screen.findByText("No fields found")).toBeInTheDocument();
	});

	it("jumps to a field on another tab: switches, focuses", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		fireEvent.click(await screen.findByText("Meta description"));
		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toBeVisible();
		});
		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toHaveFocus();
		});
	});

	// Regression for a Controller-based field (reference, media, select):
	// its interactive control has no `name` attribute, so neither
	// `document.getElementsByName` nor RHF's `setFocus` can reach it. The
	// jump must fall back to the anker-style `<label htmlFor>` sibling and
	// focus the first focusable element inside its field container.
	it("jumps to a field with no name attribute: switches, focuses its labeled control", async () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("title", "Title"),
						makeSection("seo", "SEO"),
						makePickerField("photo", "Photo"),
					]}
				/>
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "photo" },
		});
		// The field's own `<label>Photo</label>` (rendered, but on the inactive
		// tab) is ambiguous against the search result's label text, so scope
		// the click to the results listbox — same reasoning as the "SEO" match
		// above.
		const listbox = await screen.findByRole("listbox");
		fireEvent.click(within(listbox).getByText("Photo"));
		await waitFor(() => {
			expect(screen.getByTestId("field-photo")).toBeVisible();
		});
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "pick" })).toHaveFocus();
		});
	});

	// Chakra's vertical tabs recipe makes Tabs.Root a row-flex container, so
	// anything rendered inside it becomes a row item beside the nav column.
	// The search box must therefore live OUTSIDE Tabs.Root in vertical mode
	// (a full-width block above nav+content). jsdom cannot assert flex
	// layout, but it can assert DOM structure.
	it("places the search outside Tabs.Root for vertical orientation", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeSection("seo", "SEO", "vertical"),
						makeField("meta", "Meta description"),
					]}
				/>
			</Wrapper>,
		);
		expect(screen.getByRole("tablist")).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
		expect(
			screen
				.getByTestId("field-search")
				.closest('[data-scope="tabs"][data-part="root"]'),
		).toBeNull();
	});

	it("focuses search on '/' when no input is focused", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.keyDown(document.body, { key: "/" });
		await waitFor(() => {
			expect(screen.getByPlaceholderText("Find field…")).toHaveFocus();
		});
	});

	// Inside EditDrawer, Chakra's drawer also closes on Escape. Without
	// containment, dismissing an open dropdown would bubble Escape up and
	// close the drawer too, losing in-progress edits.
	it("contains Escape inside the dropdown: clears the query without letting it bubble", async () => {
		const onWrapperKeyDown = vi.fn();
		render(
			// biome-ignore lint/a11y/noStaticElementInteractions: test-only listener standing in for a real ancestor (e.g. Chakra's drawer) that closes on Escape
			<div onKeyDown={onWrapperKeyDown}>
				<Wrapper>
					<SpecForm schema={schema} />
				</Wrapper>
			</div>,
		);
		const input = screen.getByPlaceholderText("Find field…");
		fireEvent.change(input, { target: { value: "meta" } });
		// SearchInput debounces onSearch, so the dropdown appears asynchronously.
		await screen.findByRole("listbox");

		fireEvent.keyDown(input, { key: "Escape" });

		// Containment is provable synchronously: if Escape were going to
		// bubble, onWrapperKeyDown fired during the dispatch above.
		expect(onWrapperKeyDown).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		});
	});

	// The same claim, pressed at the earliest instant it can be: the test above
	// waits for the listbox with `findByRole`, which proves the render landed —
	// not that the containment listener is attached. `asSoonAsRendered` says why
	// those are different, and `spec-form.mdx` records what the component owes
	// because of it. An Author racing the debounce that opens the dropdown can
	// land in the same gap, and lose the drawer's edits to it (#82).
	it("contains an Escape pressed the instant the dropdown appears", async () => {
		const onWrapperKeyDown = vi.fn();
		render(
			// biome-ignore lint/a11y/noStaticElementInteractions: test-only listener standing in for a real ancestor (e.g. Chakra's drawer) that closes on Escape
			<div onKeyDown={onWrapperKeyDown}>
				<Wrapper>
					<SpecForm schema={schema} />
				</Wrapper>
			</div>,
		);
		const input = screen.getByPlaceholderText("Find field…");
		fireEvent.change(input, { target: { value: "meta" } });

		// Dispatched natively rather than through fireEvent, which RTL wraps in
		// act() — and act()'s exit flushes the pending passive effects, handing
		// the unfixed component exactly the ordering it was missing.
		await asSoonAsRendered('[role="listbox"]', () => {
			input.dispatchEvent(
				new KeyboardEvent("keydown", {
					key: "Escape",
					bubbles: true,
					cancelable: true,
				}),
			);
		});

		expect(onWrapperKeyDown).not.toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
		});
	});

	it("skips disabled controls in the jump focus fallback", async () => {
		// A picker-style field whose FIRST focusable child is disabled: the
		// fallback must focus the next enabled control, not no-op on the
		// disabled one.
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("title", "Title"),
						makeSection("seo", "SEO"),
						makeDisabledFirstField("locked", "Locked picker"),
					]}
				/>
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "locked" },
		});
		const listbox = await screen.findByRole("listbox");
		fireEvent.click(within(listbox).getByText("Locked picker"));
		await waitFor(() => {
			expect(screen.getByLabelText("enabled-control")).toHaveFocus();
		});
	});

	it("lets Escape propagate to ancestors when the dropdown is already closed", () => {
		const onWrapperKeyDown = vi.fn();
		render(
			// biome-ignore lint/a11y/noStaticElementInteractions: test-only listener standing in for a real ancestor (e.g. Chakra's drawer) that closes on Escape
			<div onKeyDown={onWrapperKeyDown}>
				<Wrapper>
					<SpecForm schema={schema} />
				</Wrapper>
			</div>,
		);
		const input = screen.getByPlaceholderText("Find field…");
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

		fireEvent.keyDown(input, { key: "Escape" });

		expect(onWrapperKeyDown).toHaveBeenCalledTimes(1);
	});
});
