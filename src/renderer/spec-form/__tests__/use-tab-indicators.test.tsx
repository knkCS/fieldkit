import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm — tab indicators", () => {
	it("shows a dirty dot on the tab holding an edited field", async () => {
		render(
			<Wrapper defaultValues={{ title: "", meta: "" }}>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByTestId("field-title"), {
			target: { value: "changed" },
		});
		expect(await screen.findByTestId("tab-dirty-0")).toBeInTheDocument();
		expect(screen.queryByTestId("tab-dirty-1")).not.toBeInTheDocument();
	});
});
