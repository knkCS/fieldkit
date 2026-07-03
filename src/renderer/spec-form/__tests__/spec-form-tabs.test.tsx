import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm — horizontal tabs", () => {
	it("renders a tab per section plus the implicit first tab", () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual(["General", "SEO"]);
	});

	it("honors the defaultTab label override", () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} labels={{ defaultTab: "Allgemein" }} />
			</Wrapper>,
		);
		expect(screen.getByRole("tab", { name: /Allgemein/ })).toBeInTheDocument();
	});

	it("keeps inactive tab panels mounted in the DOM", () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		// "meta" lives on the inactive SEO tab — present but hidden.
		expect(screen.getByTestId("field-meta")).toBeInTheDocument();
		expect(screen.getByTestId("field-meta")).not.toBeVisible();
		expect(screen.getByTestId("field-title")).toBeVisible();
	});

	it("switches panels on tab click", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		// The underlying Ark UI tabs machine commits the value change on a
		// microtask, so flush via an async act() rather than a bare fireEvent.
		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		expect(screen.getByTestId("field-meta")).toBeVisible();
		expect(screen.getByTestId("field-title")).not.toBeVisible();
	});
});
