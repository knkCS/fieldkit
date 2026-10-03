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
		await click(within(a).getByText("A Toggle"));
		await click(within(a).getByText("A Toggle"));
		expect(seoSelected(a)).toBe("false");
	});
});
