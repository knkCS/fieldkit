import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeCard, makeField, makeSection, Wrapper } from "./helpers";

const cardedSchema = [
	makeCard("c1", "Basics"),
	makeField("title", "Title"),
	makeField("summary", "Summary"),
	makeCard("c2"), // untitled
	makeField("notes", "Notes"),
];

describe("SpecForm — carded edit mode", () => {
	it("renders one full-width card surface per marker, in schema order", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		expect(within(surfaces[0]).getByTestId("field-title")).toBeInTheDocument();
		expect(
			within(surfaces[0]).getByTestId("field-summary"),
		).toBeInTheDocument();
		expect(within(surfaces[1]).getByTestId("field-notes")).toBeInTheDocument();
	});

	it("shows a non-empty title as a small heading; untitled cards get none", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(
			within(surfaces[0]).getByRole("heading", { name: "Basics" }),
		).toBeInTheDocument();
		expect(within(surfaces[1]).queryByRole("heading")).not.toBeInTheDocument();
	});

	it("card markers render no form control of their own", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} />
			</Wrapper>,
		);
		expect(screen.queryByTestId("field-c1")).not.toBeInTheDocument();
		expect(screen.queryByTestId("field-c2")).not.toBeInTheDocument();
	});

	it("tabs without cards render exactly as today — no wrapper element", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a"), makeField("b")]} />
			</Wrapper>,
		);
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
		const fieldA = screen.getByTestId("field-a");
		expect(fieldA).toBeInTheDocument();
		// Verify no wrapper exists between field and FieldRenderer: field's direct
		// parent must be the FieldRenderer container (data-testid="field-renderer").
		// This catches accidental wrapping like `!hasCards && <Box>{FieldRenderer}</Box>`.
		expect(fieldA.parentElement).toHaveAttribute(
			"data-testid",
			"field-renderer",
		);
		// Harden: verify no wrapper exists between field-renderer and tab content.
		// Count ancestors from field-renderer up to the tab panel. Any inserted
		// wrapper increments this count, exposing accidental wrapping like
		// `!hasCards && <Box>{FieldRenderer}</Box>`.
		const fieldRenderer = fieldA.parentElement;
		expect(fieldRenderer).toHaveAttribute("data-testid", "field-renderer");
		// Walk up from FieldRenderer until we find an element with role="tabpanel"
		// (the Tabs.Content), counting intermediate elements.
		let current: HTMLElement | null = fieldRenderer;
		const intermediates: HTMLElement[] = [];
		while (current && current.getAttribute("role") !== "tabpanel") {
			current = current.parentElement;
			if (current && current.getAttribute("role") !== "tabpanel") {
				intermediates.push(current);
			}
		}
		// With no wrapper: field-renderer -> several Chakra ancestors.
		// With an added wrapper: field-renderer -> wrapper -> several Chakra ancestors.
		// The count increases by 1 with a wrapper. Currently there are 3 ancestor elements.
		expect(intermediates.length).toBeLessThanOrEqual(
			3,
			`Found ${intermediates.length} intermediate elements. A wrapper added to CardedFields' !hasCards branch would increase this count to 4+.`,
		);
	});

	it("degrades gracefully: leading loose fields render INSIDE an implicit untitled card", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("loose", "Loose"),
						makeCard("c1", "Extra"),
						makeField("b", "B"),
					]}
				/>
			</Wrapper>,
		);
		const surfaces = screen.getAllByTestId("card-surface");
		expect(surfaces).toHaveLength(2);
		// The loose field actually RENDERS, inside the first (implicit) frame,
		// which has no heading of its own.
		expect(within(surfaces[0]).getByTestId("field-loose")).toBeInTheDocument();
		expect(within(surfaces[0]).queryByRole("heading")).not.toBeInTheDocument();
		expect(
			within(surfaces[1]).getByRole("heading", { name: "Extra" }),
		).toBeInTheDocument();
	});

	it("renders cards inside section tabs (all panels stay mounted)", () => {
		render(
			<Wrapper>
				<SpecForm
					schema={[
						makeField("a"),
						makeSection("s1", "SEO"),
						makeCard("c1", "Meta"),
						makeField("m", "Meta title"),
					]}
				/>
			</Wrapper>,
		);
		const surface = screen.getByTestId("card-surface");
		expect(within(surface).getByTestId("field-m")).toBeInTheDocument();
		// The card-less implicit tab stays wrapper-free.
		expect(
			screen.getByTestId("field-a").closest("[data-testid='card-surface']"),
		).toBeNull();
	});

	it("skeleton draws its rows inside card frames when the first tab has cards", () => {
		render(
			<Wrapper>
				<SpecForm schema={cardedSchema} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
		expect(screen.getAllByTestId("card-surface")).toHaveLength(2);
	});

	it("skeleton stays flat for card-less schemas", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a")]} loading />
			</Wrapper>,
		);
		expect(screen.getByTestId("spec-form-skeleton")).toBeInTheDocument();
		expect(screen.queryAllByTestId("card-surface")).toEqual([]);
	});
});
