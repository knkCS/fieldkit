import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { TocReferenceField } from "../toc-reference-field";

function Wrapper({
	children,
	defaultValues = { toc_ref: "" },
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

describe("TocReferenceField", () => {
	const field: Field = {
		field_type: "toc_reference",
		config: {
			name: "TOC Reference",
			api_accessor: "toc_ref",
			required: false,
			instructions: "Pick a parent page",
		},
		settings: {
			blueprints: ["page"],
		},
		children: null,
		system: false,
	};

	const mockAdapter: FieldKitAdapters["reference"] = {
		search: vi.fn().mockResolvedValue([
			{ id: "page-1", display_name: "Page One" },
			{ id: "page-2", display_name: "Page Two" },
		]),
		fetch: vi.fn().mockResolvedValue([]),
	};

	it("renders 'adapter not configured' when no adapter", () => {
		render(
			<Wrapper>
				<TocReferenceField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByText("Reference adapter not configured"),
		).toBeInTheDocument();
	});

	it("renders search input when adapter is available and no value selected", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<TocReferenceField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByPlaceholderText("Search TOC reference..."),
		).toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<TocReferenceField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/TOC Reference/)).toBeInTheDocument();
		expect(screen.getByText("Pick a parent page")).toBeInTheDocument();
	});

	it("hides search input when readOnly", () => {
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<TocReferenceField field={field} readOnly />
			</Wrapper>,
		);
		expect(
			screen.queryByPlaceholderText("Search TOC reference..."),
		).not.toBeInTheDocument();
	});

	it("shows search results after typing", async () => {
		const user = userEvent.setup();
		render(
			<Wrapper adapters={{ reference: mockAdapter }}>
				<TocReferenceField field={field} />
			</Wrapper>,
		);

		const input = screen.getByPlaceholderText("Search TOC reference...");
		await user.type(input, "page");

		await waitFor(() => {
			expect(mockAdapter.search).toHaveBeenCalled();
		});

		await waitFor(() => {
			expect(screen.getByText("Page One")).toBeInTheDocument();
			expect(screen.getByText("Page Two")).toBeInTheDocument();
		});
	});

	it("displays selected item with remove button", async () => {
		const fetchAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockResolvedValue([]),
			fetch: vi
				.fn()
				.mockResolvedValue([{ id: "page-1", display_name: "Page One" }]),
		};

		render(
			<Wrapper
				adapters={{ reference: fetchAdapter }}
				defaultValues={{ toc_ref: "page-1" }}
			>
				<TocReferenceField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Page One")).toBeInTheDocument();
		});

		expect(
			screen.getByRole("button", { name: /Remove Page One/ }),
		).toBeInTheDocument();
	});

	it("hides search input when a value is already selected", async () => {
		const fetchAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockResolvedValue([]),
			fetch: vi
				.fn()
				.mockResolvedValue([{ id: "page-1", display_name: "Page One" }]),
		};

		render(
			<Wrapper
				adapters={{ reference: fetchAdapter }}
				defaultValues={{ toc_ref: "page-1" }}
			>
				<TocReferenceField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Page One")).toBeInTheDocument();
		});

		// Search input should be hidden since a value is selected (single-select)
		expect(
			screen.queryByPlaceholderText("Search TOC reference..."),
		).not.toBeInTheDocument();
	});

	it("hides remove button in readOnly mode", async () => {
		const fetchAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockResolvedValue([]),
			fetch: vi
				.fn()
				.mockResolvedValue([{ id: "page-1", display_name: "Page One" }]),
		};

		render(
			<Wrapper
				adapters={{ reference: fetchAdapter }}
				defaultValues={{ toc_ref: "page-1" }}
			>
				<TocReferenceField field={field} readOnly />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Page One")).toBeInTheDocument();
		});

		expect(
			screen.queryByRole("button", { name: /Remove/ }),
		).not.toBeInTheDocument();
	});

	it("shows error on adapter failure", async () => {
		const failingAdapter: FieldKitAdapters["reference"] = {
			search: vi.fn().mockRejectedValue(new Error("Network error")),
			fetch: vi.fn().mockRejectedValue(new Error("Fetch failed")),
		};

		render(
			<Wrapper
				adapters={{ reference: failingAdapter }}
				defaultValues={{ toc_ref: "some-id" }}
			>
				<TocReferenceField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load references")).toBeInTheDocument();
		});
	});

	it("has displayName", () => {
		expect(TocReferenceField.displayName).toBe("TocReferenceField");
	});
});
