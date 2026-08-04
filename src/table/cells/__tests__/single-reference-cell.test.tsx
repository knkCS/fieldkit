import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SingleReferenceSettings } from "../../../schema/field-types/single-reference";
import type { Field } from "../../../schema/types";
import { SingleReferenceCell } from "../single-reference-cell";

const field: Field<SingleReferenceSettings> = {
	field_type: "single_reference",
	config: {
		name: "Primary article",
		api_accessor: "primary_article",
		required: false,
		instructions: "",
	},
	settings: { blueprints: ["article"] },
	system: false,
};

describe("SingleReferenceCell", () => {
	// A cell has neither Adapter access nor async, so it cannot resolve a
	// name. It shows the id — the one thing the value actually carries.
	it("renders the referenced Content's id", () => {
		render(<SingleReferenceCell field={field} value={{ id: "article-1" }} />);
		expect(screen.getByText("article-1")).toBeInTheDocument();
	});

	it("renders the empty-cell dash for no Reference", () => {
		render(<SingleReferenceCell field={field} value={null} />);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders the empty-cell dash for a value that is not a Reference", () => {
		render(<SingleReferenceCell field={field} value={["article-1"]} />);
		expect(screen.getByText("—")).toBeInTheDocument();
	});
});
