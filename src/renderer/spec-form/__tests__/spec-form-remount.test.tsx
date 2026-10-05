import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ConsumerHarnessApp } from "./consumer-harness";
import { makeField, makeSection } from "./helpers";

// SpecForm unmounted and remounted against a live, Consumer-owned form
// (#333): anker ADR 0004 mounts only the active nav-link tab, so a Consumer
// holding its form above such a tab remounts SpecForm on every return.

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];
const zodSchema = z.object({ title: z.string(), meta: z.string().min(1) });
const defaultValues = { title: "ok", meta: "" };

function seoSelected(root: HTMLElement = document.body) {
	return within(root)
		.getByRole("tab", { name: /SEO/ })
		.getAttribute("aria-selected");
}

async function click(el: HTMLElement) {
	await act(async () => {
		fireEvent.click(el);
	});
}

describe("SpecForm — remounted against a Consumer-owned form", () => {
	it("keeps values, dirty state and errors across an unmount and remount", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
			/>,
		);

		fireEvent.change(screen.getByTestId("field-title"), {
			target: { value: "changed" },
		});
		await click(screen.getByText("Save"));
		expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();

		await click(screen.getByText("Toggle"));
		expect(screen.queryByTestId("field-title")).not.toBeInTheDocument();
		await click(screen.getByText("Toggle"));

		expect(screen.getByTestId("field-title")).toHaveValue("changed");
		expect(screen.getByTestId("tab-dirty-0")).toBeInTheDocument();
		expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();
	});

	it("still jumps after a failed save while mounted", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
			/>,
		);
		expect(seoSelected()).toBe("false");

		await click(screen.getByText("Save"));

		expect(seoSelected()).toBe("true");
	});

	it("jumps once on remount after a failed save while unmounted, and not on a further remount", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
				initiallyMounted={false}
			/>,
		);

		await click(screen.getByText("Save"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("true");

		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("false");
	});

	it("does not jump again on remount after a failed save it already jumped for", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
			/>,
		);

		await click(screen.getByText("Save"));
		expect(seoSelected()).toBe("true");

		// The author moves on; the remembered section is now General (#334),
		// so a re-jump would be the only way back to SEO.
		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("false");
	});

	it("jumps again for a new failed save", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
			/>,
		);

		await click(screen.getByText("Save"));
		expect(seoSelected()).toBe("true");
		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("false");

		// Mounted, the new failed save jumps…
		await click(screen.getByText("Save"));
		expect(seoSelected()).toBe("true");

		// …and so does one made while unmounted.
		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Save"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("true");
	});

	it("jumps after a reset() and a failed save while unmounted", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
			/>,
		);

		await click(screen.getByText("Save"));
		await click(screen.getByText("Save"));
		expect(seoSelected()).toBe("true");

		// reset() rewinds submitCount to 0; the next failed save is count 1,
		// below the 2 already handled, and must still jump.
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Reset"));
		await click(screen.getByText("Save"));
		await click(screen.getByText("Toggle"));
		expect(seoSelected()).toBe("true");
	});

	it("keeps two forms' handled saves apart", async () => {
		render(
			<>
				<ConsumerHarnessApp
					name="A"
					schema={schema}
					zodSchema={zodSchema}
					defaultValues={defaultValues}
				/>
				<ConsumerHarnessApp
					name="B"
					schema={schema}
					zodSchema={zodSchema}
					defaultValues={defaultValues}
					initiallyMounted={false}
				/>
			</>,
		);
		const a = screen.getByRole("region", { name: "A" });
		const b = screen.getByRole("region", { name: "B" });

		// A handles its save 1; B's save 1, made unmounted, is still B's to
		// jump for.
		await click(within(a).getByText("A Save"));
		expect(seoSelected(a)).toBe("true");
		await click(within(b).getByText("B Save"));
		await click(within(b).getByText("B Toggle"));
		expect(seoSelected(b)).toBe("true");

		// And B having handled save 1 does not stop nor start A's jump.
		await click(within(a).getByRole("tab", { name: "General" }));
		await click(within(a).getByText("A Toggle"));
		await click(within(a).getByText("A Toggle"));
		expect(seoSelected(a)).toBe("false");
	});
});

// The open section, remembered per form by its Accessor (#334): leaving the
// Content tab and coming back reopens the section the author was in.
describe("SpecForm — the active section across a remount", () => {
	const sectioned = [
		makeField("title", "Title"),
		makeSection("seo", "SEO"),
		makeField("meta", "Meta description"),
		makeSection("media", "Media"),
		makeField("image", "Image"),
	];
	const reordered = [
		makeField("title", "Title"),
		makeSection("media", "Media"),
		makeField("image", "Image"),
		makeSection("seo", "SEO"),
		makeField("meta", "Meta description"),
	];
	const seoRemoved = [
		makeField("title", "Title"),
		makeSection("media", "Media"),
		makeField("image", "Image"),
	];
	const lenient = z.object({
		title: z.string(),
		meta: z.string(),
		image: z.string(),
	});
	const values = { title: "ok", meta: "", image: "" };

	function selected(name: string, root: HTMLElement = document.body) {
		return within(root)
			.getByRole("tab", { name: new RegExp(name) })
			.getAttribute("aria-selected");
	}

	it("reopens the section the author was in", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Toggle"));

		expect(selected("Media")).toBe("true");
	});

	it("reopens the implicit leading tab when the author left from it", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Toggle"));

		expect(selected("General")).toBe("true");
	});

	it("follows the section's Accessor when the sections are reordered", async () => {
		const { rerender } = render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);

		await click(screen.getByRole("tab", { name: "SEO" }));
		await click(screen.getByText("Toggle"));
		rerender(
			<ConsumerHarnessApp
				schema={reordered}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);
		await click(screen.getByText("Toggle"));

		expect(screen.getAllByRole("tab")[2]).toHaveTextContent("SEO");
		expect(selected("SEO")).toBe("true");
	});

	it("falls back to the first tab when that section was removed", async () => {
		const { rerender } = render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);

		await click(screen.getByRole("tab", { name: "SEO" }));
		await click(screen.getByText("Toggle"));
		rerender(
			<ConsumerHarnessApp
				schema={seoRemoved}
				zodSchema={lenient}
				defaultValues={values}
			/>,
		);
		await click(screen.getByText("Toggle"));

		expect(screen.queryByRole("tab", { name: "SEO" })).not.toBeInTheDocument();
		expect(selected("General")).toBe("true");
	});

	it("lets a pending error jump win over the remembered section", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient.extend({ meta: z.string().min(1) })}
				defaultValues={values}
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Save"));
		await click(screen.getByText("Toggle"));

		expect(selected("SEO")).toBe("true");
		expect(selected("Media")).toBe("false");
	});

	it("keeps two forms' sections apart", async () => {
		render(
			<>
				<ConsumerHarnessApp
					name="A"
					schema={sectioned}
					zodSchema={lenient}
					defaultValues={values}
				/>
				<ConsumerHarnessApp
					name="B"
					schema={sectioned}
					zodSchema={lenient}
					defaultValues={values}
				/>
			</>,
		);
		const a = screen.getByRole("region", { name: "A" });
		const b = screen.getByRole("region", { name: "B" });

		await click(within(a).getByRole("tab", { name: "Media" }));
		await click(within(b).getByRole("tab", { name: "SEO" }));
		await click(within(a).getByText("A Toggle"));
		await click(within(b).getByText("B Toggle"));
		await click(within(a).getByText("A Toggle"));
		await click(within(b).getByText("B Toggle"));

		expect(selected("Media", a)).toBe("true");
		expect(selected("SEO", b)).toBe("true");
	});
});

// The memory belongs to a record, not to a form (#339): a Consumer reusing
// one form across records names the open one with `recordKey`.
describe("SpecForm — recordKey", () => {
	const sectioned = [
		makeField("title", "Title"),
		makeSection("media", "Media"),
		makeField("image", "Image"),
	];
	const lenient = z.object({ title: z.string(), image: z.string() });
	const values = { title: "ok", image: "" };

	function mediaSelected() {
		return screen
			.getByRole("tab", { name: /Media/ })
			.getAttribute("aria-selected");
	}

	it("opens another record on the first section", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
				recordKeyed
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Next record"));
		await click(screen.getByText("Toggle"));

		expect(mediaSelected()).toBe("false");
	});

	it("keeps the section across a reset of the same record", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
				recordKeyed
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Reset"));
		await click(screen.getByText("Toggle"));

		expect(mediaSelected()).toBe("true");
	});

	it("starts another record on the first section while mounted", async () => {
		render(
			<ConsumerHarnessApp
				schema={sectioned}
				zodSchema={lenient}
				defaultValues={values}
				recordKeyed
			/>,
		);

		await click(screen.getByRole("tab", { name: "Media" }));
		await click(screen.getByText("Next record"));

		expect(mediaSelected()).toBe("false");
	});

	it("jumps for another record's failed save, though its count matches one already handled", async () => {
		render(
			<ConsumerHarnessApp
				schema={schema}
				zodSchema={zodSchema}
				defaultValues={defaultValues}
				recordKeyed
			/>,
		);

		await click(screen.getByText("Save"));
		expect(seoSelected()).toBe("true");
		// Left on General, so only a jump can bring SEO back.
		await click(screen.getByRole("tab", { name: "General" }));
		await click(screen.getByText("Toggle"));
		await click(screen.getByText("Next record"));
		await click(screen.getByText("Save"));
		await click(screen.getByText("Toggle"));

		expect(seoSelected()).toBe("true");
	});
});
