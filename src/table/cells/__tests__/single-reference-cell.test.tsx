import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldKitProvider } from "../../../renderer/provider";
import type { SingleReferenceSettings } from "../../../schema/field-types/single-reference";
import type { Field } from "../../../schema/types";
import { createFakeReferenceAdapter } from "../../../test/fake-reference-adapter";
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
	// name — and an id is not a name. It counts, exactly as the tree
	// Reference Field's cell does, so the two read the same in one table.
	it("counts the Reference rather than showing its id", () => {
		render(<SingleReferenceCell field={field} value={{ id: "article-1" }} />);
		expect(screen.getByText("1 reference")).toBeInTheDocument();
		expect(screen.queryByText("article-1")).not.toBeInTheDocument();
	});

	it("renders the empty-cell dash for no Reference", () => {
		render(<SingleReferenceCell field={field} value={null} />);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("renders the empty-cell dash for a value that is not a Reference", () => {
		render(<SingleReferenceCell field={field} value={["article-1"]} />);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("never asks the Adapter for a name", async () => {
		const adapter = createFakeReferenceAdapter();
		render(
			<FieldKitProvider plugins={[]} adapters={{ reference: adapter }}>
				<SingleReferenceCell field={field} value={{ id: "article-1" }} />
			</FieldKitProvider>,
		);

		// Given every chance to: a resolution would land on a later tick.
		await waitFor(() => {
			expect(screen.getByText("1 reference")).toBeInTheDocument();
		});
		expect(adapter.fetches).toHaveLength(0);
		expect(screen.queryByText("Cats of the world")).not.toBeInTheDocument();
	});
});
