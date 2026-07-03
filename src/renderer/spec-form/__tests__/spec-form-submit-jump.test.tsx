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

function PrecedenceHarness() {
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
						<SpecForm schema={schema} />
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
	});
});
