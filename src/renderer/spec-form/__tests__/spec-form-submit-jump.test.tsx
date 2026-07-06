import { zodResolver } from "@hookform/resolvers/zod";
import { Provider } from "@knkcs/anker/primitives";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { FieldKitProvider } from "../../provider";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, testPlugins } from "./helpers";

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

function Harness() {
	const methods = useForm({
		resolver: zodResolver(
			z.object({ title: z.string(), meta: z.string().min(1) }),
		),
		defaultValues: { title: "ok", meta: "" },
	});
	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={testPlugins}>
					<form onSubmit={methods.handleSubmit(() => {})}>
						<SpecForm schema={schema} />
						<button type="submit">Save</button>
					</form>
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

function ResetHarness() {
	const methods = useForm({
		resolver: zodResolver(
			z.object({ title: z.string(), meta: z.string().min(1) }),
		),
		defaultValues: { title: "ok", meta: "" },
	});
	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={testPlugins}>
					<form onSubmit={methods.handleSubmit(() => {})}>
						<SpecForm schema={schema} />
						<button type="submit">Save</button>
						<button
							type="button"
							onClick={() => methods.reset({ title: "ok", meta: "" })}
						>
							Reset
						</button>
					</form>
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

function PrecedenceHarness({
	labels,
}: {
	labels?: { tabErrors?: string };
} = {}) {
	const methods = useForm({
		resolver: zodResolver(
			z.object({ title: z.string(), meta: z.string().email() }),
		),
		defaultValues: { title: "ok", meta: "" },
	});
	return (
		<Provider>
			<FormProvider {...methods}>
				<FieldKitProvider plugins={testPlugins}>
					<form onSubmit={methods.handleSubmit(() => {})}>
						<SpecForm schema={schema} labels={labels} />
						<button type="submit">Save</button>
					</form>
				</FieldKitProvider>
			</FormProvider>
		</Provider>
	);
}

describe("SpecForm — submit jump", () => {
	it("switches to the tab with the first error and focuses the field", async () => {
		render(<Harness />);
		// SEO tab (holding required-empty "meta") is inactive.
		expect(screen.getByTestId("field-meta")).not.toBeVisible();

		fireEvent.click(screen.getByText("Save"));

		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toBeVisible();
		});
		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toHaveFocus();
		});
	});

	// Closes a review finding from Task 8: the error-badge-trumps-dirty-dot
	// ternary shipped without coverage because no prior test harness wired a
	// resolver. Make "meta" both dirty (changed from its default) and
	// invalid (fails email validation) and confirm the error badge wins.
	it("shows the error badge, not the dirty dot, for a field that is both dirty and invalid", async () => {
		render(<PrecedenceHarness />);

		fireEvent.change(screen.getByTestId("field-meta"), {
			target: { value: "not-an-email" },
		});

		await act(async () => {
			fireEvent.click(screen.getByText("Save"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("tab-errors-1")).toBeInTheDocument();
		});
		expect(screen.queryByTestId("tab-dirty-1")).not.toBeInTheDocument();
		// Only "meta" is invalid, so the badge's accessible name is the
		// default `tabErrors` label interpolated with count 1 — proves the
		// `.replace("{count}", …)` wiring at this call site, not just that a
		// badge with SOME label renders.
		expect(screen.getByTestId("tab-errors-1")).toHaveAttribute(
			"aria-label",
			"1 invalid fields",
		);
	});

	// Finding 2 (review): the `labels.tabErrors` override and its
	// `.replace("{count}", …)` interpolation were untested — a wrong token
	// or count source would still pass every prior test.
	it("interpolates a labels.tabErrors override into the badge's aria-label", async () => {
		render(<PrecedenceHarness labels={{ tabErrors: "{count} Fehler" }} />);

		fireEvent.change(screen.getByTestId("field-meta"), {
			target: { value: "not-an-email" },
		});

		await act(async () => {
			fireEvent.click(screen.getByText("Save"));
		});

		await waitFor(() => {
			expect(screen.getByTestId("tab-errors-1")).toHaveAttribute(
				"aria-label",
				"1 Fehler",
			);
		});
	});

	// Regression test: RHF's reset() (EditDrawer calls it whenever the row
	// being edited changes) restarts submitCount at 0 without touching
	// lastHandledSubmit.current, so a post-reset failing submit whose count
	// collides with the pre-reset one must still trigger a jump.
	it("jumps to the error tab again after a reset restarts submitCount", async () => {
		render(<ResetHarness />);

		// Assert via the tab trigger's aria-selected rather than the field's
		// focus/visibility: RHF's own `shouldFocusError` default focuses the
		// invalid field on every failed submit regardless of our jump effect,
		// so focus alone can't tell whether *our* setActiveTab call fired.
		fireEvent.click(screen.getByText("Save"));
		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});

		// Move back to General so the next assertion can tell whether the
		// second failed submit actually re-jumps, rather than the tab simply
		// having stayed on SEO from the first jump.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: "General" }));
		});
		expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
			"aria-selected",
			"false",
		);

		await act(async () => {
			fireEvent.click(screen.getByText("Reset"));
		});
		fireEvent.click(screen.getByText("Save"));

		await waitFor(() => {
			expect(screen.getByRole("tab", { name: /SEO/ })).toHaveAttribute(
				"aria-selected",
				"true",
			);
		});
	});
});
