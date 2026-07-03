import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

describe("SpecForm — orientation", () => {
	it("renders a vertical tablist when the first section is configured vertical", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[makeSection("s1", "Content", "vertical"), makeField("a")]}
				/>
			</Wrapper>,
		);
		expect(screen.getByRole("tablist")).toHaveAttribute(
			"aria-orientation",
			"vertical",
		);
	});

	it("defaults to horizontal", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeSection("s1", "Content"), makeField("a")]} />
			</Wrapper>,
		);
		expect(screen.getByRole("tablist")).toHaveAttribute(
			"aria-orientation",
			"horizontal",
		);
	});
});
