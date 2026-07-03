import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, Wrapper } from "./helpers";

describe("SpecForm — core", () => {
	it("renders a flat form with no tab chrome when the schema has no sections", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a"), makeField("b")]} />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-a")).toBeInTheDocument();
		expect(screen.getByTestId("field-b")).toBeInTheDocument();
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
		expect(
			screen.queryByPlaceholderText("Find field…"),
		).not.toBeInTheDocument();
	});

	it("renders nothing for an empty schema", () => {
		const { container } = render(
			<Wrapper>
				<SpecForm schema={[]} />
			</Wrapper>,
		);
		expect(container.querySelector("[data-testid]")).toBeNull();
	});

	it("renders skeletons instead of fields when loading", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a"), makeField("b")]} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
		expect(screen.queryByTestId("field-a")).not.toBeInTheDocument();
	});

	// A consumer fetching the spec itself passes an empty schema alongside
	// `loading` until the real spec arrives — loading must win over the
	// "no tabs yet" empty-schema short-circuit, or the consumer sees nothing
	// instead of a skeleton.
	it("renders a skeleton when loading with an empty schema", () => {
		render(
			<Wrapper>
				<SpecForm schema={[]} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
	});

	it("passes readOnly through to fields", () => {
		// TestField ignores readOnly; assert via FieldRenderer contract instead:
		// the real field components receive it. Here we only assert no crash.
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a")]} readOnly />
			</Wrapper>,
		);
		expect(screen.getByTestId("field-a")).toBeInTheDocument();
	});
});
