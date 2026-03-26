import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { ReferenceField } from "../reference-field";

function Wrapper({
	children,
	defaultValues = { ref_field: [] },
	adapters = {},
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
	adapters?: FieldKitAdapters;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters}>
				<FormProvider {...methods}>{children}</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

describe("ReferenceField", () => {
	const field: Field = {
		field_type: "reference",
		config: {
			name: "Related Items",
			api_accessor: "ref_field",
			required: false,
			instructions: "Link related items",
		},
		settings: {
			blueprints: ["article"],
		},
		children: null,
		system: false,
	};

	const mockAdapter: FieldKitAdapters["reference"] = {
		search: vi.fn().mockResolvedValue([
			{ id: "1", display_name: "Article One" },
			{ id: "2", display_name: "Article Two" },
		]),
		fetch: vi.fn().mockResolvedValue([]),
	};

	it("renders 'adapter not configured' when no adapter", () => {
		render(
			<Wrapper>
				<ReferenceField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByText("Reference adapter not configured"),
		).toBeInTheDocument();
	});

	it("renders search input when adapter is available", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<ReferenceField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByPlaceholderText("Search references..."),
		).toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<ReferenceField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Related Items/)).toBeInTheDocument();
		expect(screen.getByText("Link related items")).toBeInTheDocument();
	});

	it("hides search input when readOnly", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<ReferenceField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByPlaceholderText("Search references..."),
		).not.toBeInTheDocument();
	});

	it("shows search results after typing", async () => {
		const user = userEvent.setup();
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<ReferenceField field={field} />
			</Wrapper>,
		);

		const input = screen.getByPlaceholderText("Search references...");
		await user.type(input, "article");

		await waitFor(() => {
			expect(mockAdapter.search).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(screen.getByText("Article One")).toBeInTheDocument();
			expect(screen.getByText("Article Two")).toBeInTheDocument();
		});
	});

	it("shows error on adapter failure", async () => {
		const failingAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockRejectedValue(new Error("Network error")),
			fetch: vi.fn().mockRejectedValue(new Error("Network error")),
		};

		render(
			<Wrapper
				adapters={{ reference: failingAdapter }}
				defaultValues={{ ref_field: ["existing-id"] }}
			>
				<ReferenceField field={field} />
			</Wrapper>,
		);

		// The fetch call for the existing ID should fail
		await waitFor(() => {
			expect(screen.getByText("Failed to load references")).toBeInTheDocument();
		});
	});

	it("displays selected items with remove buttons", async () => {
		const fetchAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockResolvedValue([]),
			fetch: vi
				.fn()
				.mockResolvedValue([{ id: "abc", display_name: "My Article" }]),
		};

		render(
			<Wrapper
				adapters={{ reference: fetchAdapter }}
				defaultValues={{ ref_field: ["abc"] }}
			>
				<ReferenceField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("My Article")).toBeInTheDocument();
		});

		expect(
			screen.getByRole("button", { name: /Remove My Article/ }),
		).toBeInTheDocument();
	});

	it("hides remove buttons in readOnly mode", async () => {
		const fetchAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockResolvedValue([]),
			fetch: vi
				.fn()
				.mockResolvedValue([{ id: "abc", display_name: "My Article" }]),
		};

		render(
			<Wrapper
				adapters={{ reference: fetchAdapter }}
				defaultValues={{ ref_field: ["abc"] }}
			>
				<ReferenceField field={field} readOnly />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("My Article")).toBeInTheDocument();
		});

		expect(
			screen.queryByRole("button", { name: /Remove/ }),
		).not.toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(ReferenceField.displayName).toBe("ReferenceField");
	});
});
