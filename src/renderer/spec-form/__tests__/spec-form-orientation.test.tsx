import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import {
	expectPanelTakesRemainingWidth,
	makeField,
	makeSection,
	Wrapper,
} from "./helpers";

const panel = () => screen.getByRole("tabpanel");

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

	it("gives a vertical form's Tab panel the remaining width beside the list", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[makeSection("s1", "Content", "vertical"), makeField("a")]}
				/>
			</Wrapper>,
		);
		expectPanelTakesRemainingWidth(panel());
	});

	it("gives a vertical read page's Tab panel the remaining width beside the list", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[makeSection("s1", "Content", "vertical"), makeField("a")]}
					mode="read"
					values={{ a: "x" }}
				/>
			</Wrapper>,
		);
		expectPanelTakesRemainingWidth(panel());
	});

	it("leaves a horizontal Tab panel full width, as before", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeSection("s1", "Content"), makeField("a")]} />
			</Wrapper>,
		);
		// The shell adds nothing to a horizontal panel; Chakra's recipe (which
		// jsdom doesn't apply) keeps it the column's full width.
		const style = getComputedStyle(panel());
		expect(style.flexGrow).toBe("");
		expect(style.minWidth).toBe("");
		expect(style.width).toBe("");
	});
});
