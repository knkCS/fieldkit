import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it } from "vitest";
import type { ListSettings } from "../../../schema/field-types/list";
import type { Field } from "../../../schema/types";
import { FieldKitProvider } from "../../provider";
import { ListField } from "../list-field";

function makeField(settings: ListSettings | null = {}): Field<ListSettings> {
	return {
		field_type: "list",
		config: {
			name: "Keywords",
			api_accessor: "keywords",
			required: false,
			instructions: "One keyword per entry",
		},
		settings,
		children: null,
		system: false,
	};
}

/** Reads the stored value straight from the form, so assertions about what
 * was stored never go through the same DOM the component renders. */
function StoredValue() {
	const value = useWatch({ name: "keywords" });
	return <output data-testid="stored">{JSON.stringify(value)}</output>;
}

function renderList({
	settings = {},
	entries = [],
	readOnly = false,
}: {
	settings?: ListSettings | null;
	entries?: string[];
	readOnly?: boolean;
} = {}) {
	function Wrapper() {
		const methods = useForm({ defaultValues: { keywords: entries } });
		return (
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={[]}>
					<FormProvider {...methods}>
						<ListField field={makeField(settings)} readOnly={readOnly} />
						<StoredValue />
					</FormProvider>
				</FieldKitProvider>
			</ChakraProvider>
		);
	}
	return render(<Wrapper />);
}

function stored(): string[] {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

describe("ListField", () => {
	it("renders label and instructions", () => {
		renderList();
		expect(screen.getByText(/Keywords/)).toBeInTheDocument();
		expect(screen.getByText("One keyword per entry")).toBeInTheDocument();
	});

	it("shows an empty state when there are no entries", () => {
		renderList();
		expect(screen.getByText("No entries yet.")).toBeInTheDocument();
	});

	it("adds a typed entry to the stored value", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha"] });

		await user.type(screen.getByLabelText("New entry"), "beta");
		await user.click(screen.getByRole("button", { name: "Add entry" }));

		expect(stored()).toEqual(["alpha", "beta"]);
		expect(screen.getByLabelText("New entry")).toHaveValue("");
	});

	it("adds an entry when Enter is pressed in the new-entry input", async () => {
		const user = userEvent.setup();
		renderList();

		await user.type(screen.getByLabelText("New entry"), "alpha{Enter}");

		expect(stored()).toEqual(["alpha"]);
	});

	it("does not add a blank entry", async () => {
		const user = userEvent.setup();
		renderList();

		await user.click(screen.getByRole("button", { name: "Add entry" }));

		expect(stored()).toEqual([]);
	});

	it("edits an entry in place", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta"] });

		await user.type(screen.getByLabelText("Entry 2"), "s");

		expect(stored()).toEqual(["alpha", "betas"]);
	});

	it("removes an entry", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.click(screen.getByRole("button", { name: "Remove entry 2" }));

		expect(stored()).toEqual(["alpha", "gamma"]);
	});

	it("reorders entries with the move buttons", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.click(screen.getByRole("button", { name: "Move entry 3 up" }));
		expect(stored()).toEqual(["alpha", "gamma", "beta"]);

		await user.click(screen.getByRole("button", { name: "Move entry 1 down" }));
		expect(stored()).toEqual(["gamma", "alpha", "beta"]);
	});

	it("cannot move the first entry up or the last entry down", () => {
		renderList({ entries: ["alpha", "beta"] });

		expect(
			screen.getByRole("button", { name: "Move entry 1 up" }),
		).toBeDisabled();
		expect(
			screen.getByRole("button", { name: "Move entry 2 down" }),
		).toBeDisabled();
	});

	it("filters visible entries by search without changing the stored value", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.type(screen.getByLabelText("Search entries"), "a-");

		// Not a substring of any entry — everything is filtered out.
		await waitFor(() =>
			expect(screen.queryByLabelText("Entry 1")).not.toBeInTheDocument(),
		);
		expect(stored()).toEqual(["alpha", "beta", "gamma"]);

		await user.clear(screen.getByLabelText("Search entries"));
		await user.type(screen.getByLabelText("Search entries"), "ta");

		expect(await screen.findByLabelText("Entry 2")).toHaveValue("beta");
		expect(screen.queryByLabelText("Entry 1")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Entry 3")).not.toBeInTheDocument();
		expect(stored()).toEqual(["alpha", "beta", "gamma"]);
	});

	it("removes the right entry while a search filter is active", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.type(screen.getByLabelText("Search entries"), "ta");
		await user.click(
			await screen.findByRole("button", { name: "Remove entry 2" }),
		);

		expect(stored()).toEqual(["alpha", "gamma"]);
	});

	it("reports how many entries the search matched", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.type(screen.getByLabelText("Search entries"), "et");

		expect(
			await screen.findByText("Showing 1 of 3 entries"),
		).toBeInTheDocument();
	});

	it("drops the search filter when an entry is added, so the new entry shows", async () => {
		const user = userEvent.setup();
		renderList({ entries: ["alpha", "beta", "gamma"] });

		await user.type(screen.getByLabelText("Search entries"), "et");
		expect(
			await screen.findByText("Showing 1 of 3 entries"),
		).toBeInTheDocument();

		await user.type(screen.getByLabelText("New entry"), "delta{Enter}");

		expect(stored()).toEqual(["alpha", "beta", "gamma", "delta"]);
		expect(await screen.findByLabelText("Entry 4")).toHaveValue("delta");
		expect(screen.queryByText(/^Showing /)).not.toBeInTheDocument();
	});

	it("pages to the entry it just added", async () => {
		const user = userEvent.setup();
		renderList({
			settings: { max_items_per_page: 2 },
			entries: ["alpha", "beta", "gamma", "delta"],
		});

		await user.type(screen.getByLabelText("New entry"), "epsilon{Enter}");

		expect(await screen.findByLabelText("Entry 5")).toHaveValue("epsilon");
	});

	it("shows only one page of entries when the Author set a page size", () => {
		renderList({
			settings: { max_items_per_page: 2 },
			entries: ["alpha", "beta", "gamma", "delta"],
		});

		expect(screen.getByLabelText("Entry 1")).toBeInTheDocument();
		expect(screen.getByLabelText("Entry 2")).toBeInTheDocument();
		expect(screen.queryByLabelText("Entry 3")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Entry 4")).not.toBeInTheDocument();
	});

	it("shows the next page of entries when the page changes", async () => {
		const user = userEvent.setup();
		renderList({
			settings: { max_items_per_page: 2 },
			entries: ["alpha", "beta", "gamma", "delta"],
		});

		await user.click(screen.getByRole("button", { name: "2" }));

		expect(screen.queryByLabelText("Entry 1")).not.toBeInTheDocument();
		expect(screen.getByLabelText("Entry 3")).toHaveValue("gamma");
		expect(screen.getByLabelText("Entry 4")).toHaveValue("delta");
	});

	it("does not paginate when no page size is set", () => {
		renderList({ entries: ["alpha", "beta", "gamma", "delta"] });

		expect(screen.getByLabelText("Entry 4")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "2" })).not.toBeInTheDocument();
	});

	it("hides the add, remove and reorder controls in read mode", () => {
		renderList({ entries: ["alpha", "beta"], readOnly: true });

		expect(screen.queryByLabelText("New entry")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Add entry" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Remove entry 1" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Move entry 1 down" }),
		).not.toBeInTheDocument();
		expect(screen.getByLabelText("Entry 1")).toHaveValue("alpha");
	});

	it("tolerates a field with no settings", () => {
		renderList({ settings: null, entries: ["alpha"] });
		expect(screen.getByLabelText("Entry 1")).toHaveValue("alpha");
	});

	it("has displayName", () => {
		expect(ListField.displayName).toBe("ListField");
	});
});
