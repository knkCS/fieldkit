import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { TabErrorBadge } from "../tab-error-badge";
import { makeField, makeSection, Wrapper } from "./helpers";

describe("TabErrorBadge — accessible label", () => {
	it("carries the interpolated aria-label", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<TabErrorBadge index={0} count={2} label="2 invalid fields" />
			</ChakraProvider>,
		);
		const badge = screen.getByTestId("tab-errors-0");
		expect(badge).toHaveAttribute("aria-label", "2 invalid fields");
		expect(badge).toHaveTextContent("2");
	});
});

describe("SpecForm — dirty tab announcement", () => {
	const schema = [
		makeField("title", "Title"),
		makeSection("seo", "SEO"),
		makeField("meta", "Meta description"),
	];

	it("labels the dirty dot in English by default", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "changed" },
		});
		expect(await screen.findByLabelText("Unsaved changes")).toBeInTheDocument();
	});

	it("labels.unsavedChanges overrides the dirty-dot label", async () => {
		render(
			<Wrapper>
				<SpecForm
					schema={schema}
					labels={{ unsavedChanges: "Nicht gespeichert" }}
				/>
			</Wrapper>,
		);
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "changed" },
		});
		expect(
			await screen.findByLabelText("Nicht gespeichert"),
		).toBeInTheDocument();
	});
});
