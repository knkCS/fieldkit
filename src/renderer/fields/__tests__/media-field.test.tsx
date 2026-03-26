import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../../schema/types";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { MediaField } from "../media-field";

function Wrapper({
	children,
	defaultValues = { media_field: [] },
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

describe("MediaField", () => {
	const field: Field = {
		field_type: "media",
		config: {
			name: "Featured Image",
			api_accessor: "media_field",
			required: false,
			instructions: "Upload a featured image",
		},
		settings: {
			accept: ["image/png", "image/jpeg"],
			max_items: 3,
		},
		children: null,
		system: false,
	};

	const mockAdapter: FieldKitAdapters["media"] = {
		upload: vi.fn().mockResolvedValue({
			id: "new-media",
			filename: "uploaded.png",
			url: "https://example.com/uploaded.png",
			mime_type: "image/png",
			size: 1024,
		}),
		browse: vi.fn().mockResolvedValue([
			{
				id: "img-1",
				filename: "photo.jpg",
				url: "https://example.com/photo.jpg",
				mime_type: "image/jpeg",
				size: 2048,
			},
		]),
	};

	it("renders 'adapter not configured' when no adapter", () => {
		render(
			<Wrapper>
				<MediaField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByText("Media adapter not configured"),
		).toBeInTheDocument();
	});

	it("renders upload button when adapter is available", async () => {
		render(
			<Wrapper adapters={{ media: mockAdapter }}>
				<MediaField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /Upload file/ }),
			).toBeInTheDocument();
		});
	});

	it("renders label and helper text", async () => {
		render(
			<Wrapper adapters={{ media: mockAdapter }}>
				<MediaField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Featured Image/)).toBeInTheDocument();
		expect(screen.getByText("Upload a featured image")).toBeInTheDocument();
	});

	it("hides upload button when readOnly", async () => {
		render(
			<Wrapper adapters={{ media: mockAdapter }}>
				<MediaField field={field} readOnly />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(mockAdapter.browse).toHaveBeenCalled();
		});

		expect(
			screen.queryByRole("button", { name: /Upload file/ }),
		).not.toBeInTheDocument();
	});

	it("displays selected media items with remove buttons", async () => {
		const browseAdapter: FieldKitAdapters["media"] = {
			upload: vi.fn(),
			browse: vi.fn().mockResolvedValue([
				{
					id: "img-1",
					filename: "photo.jpg",
					url: "https://example.com/photo.jpg",
					mime_type: "image/jpeg",
					size: 2048,
				},
			]),
		};

		render(
			<Wrapper
				adapters={{ media: browseAdapter }}
				defaultValues={{ media_field: ["img-1"] }}
			>
				<MediaField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("photo.jpg")).toBeInTheDocument();
		});

		expect(
			screen.getByRole("button", { name: /Remove photo\.jpg/ }),
		).toBeInTheDocument();
	});

	it("hides remove buttons in readOnly mode", async () => {
		const browseAdapter: FieldKitAdapters["media"] = {
			upload: vi.fn(),
			browse: vi.fn().mockResolvedValue([
				{
					id: "img-1",
					filename: "photo.jpg",
					url: "https://example.com/photo.jpg",
					mime_type: "image/jpeg",
					size: 2048,
				},
			]),
		};

		render(
			<Wrapper
				adapters={{ media: browseAdapter }}
				defaultValues={{ media_field: ["img-1"] }}
			>
				<MediaField field={field} readOnly />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(screen.getByText("photo.jpg")).toBeInTheDocument();
		});

		expect(
			screen.queryByRole("button", { name: /Remove/ }),
		).not.toBeInTheDocument();
	});

	it("calls browse on mount with accept filter", async () => {
		render(
			<Wrapper adapters={{ media: mockAdapter }}>
				<MediaField field={field} />
			</Wrapper>,
		);

		await waitFor(() => {
			expect(mockAdapter.browse).toHaveBeenCalledWith({
				mime_types: ["image/png", "image/jpeg"],
			});
		});
	});

	it("has displayName", () => {
		expect(MediaField.displayName).toBe("MediaField");
	});
});
