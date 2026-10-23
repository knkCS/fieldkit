import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { MediaSettings } from "../../../schema/field-types/media";
import type { Field } from "../../../schema/types";
import { createFakeMediaAdapter } from "../../../test/fake-media-adapter";
import type { FieldKitAdapters } from "../../adapters";
import { FieldKitProvider } from "../../provider";
import { MediaField } from "../media-field";

const ACCESSOR = "media_field";

function StoredValue() {
	const value = useWatch({ name: ACCESSOR });
	return <output data-testid="stored">{JSON.stringify(value ?? null)}</output>;
}

function stored(): unknown {
	return JSON.parse(screen.getByTestId("stored").textContent ?? "null");
}

function Wrapper({
	children,
	defaultValues = { [ACCESSOR]: [] },
	adapters = {},
	onError,
}: {
	children: React.ReactNode;
	defaultValues?: Record<string, unknown>;
	adapters?: FieldKitAdapters;
	onError?: (error: Error, fieldId: string) => void;
}) {
	const methods = useForm({ defaultValues });
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters} onError={onError}>
				<FormProvider {...methods}>
					{children}
					<StoredValue />
				</FormProvider>
			</FieldKitProvider>
		</ChakraProvider>
	);
}

function makeField(settings: MediaSettings | null = {}): Field<MediaSettings> {
	return {
		field_type: "media",
		config: {
			name: "Featured Image",
			api_accessor: ACCESSOR,
			required: false,
			instructions: "Upload a featured image",
		},
		settings,
		children: null,
		system: false,
	};
}

const field = makeField({ accept: ["image/png", "image/jpeg"], max_items: 3 });

const picker = () => screen.getByRole("combobox");

describe("MediaField", () => {
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

	it("renders upload button when adapter is available", () => {
		render(
			<Wrapper adapters={{ media: createFakeMediaAdapter() }}>
				<MediaField field={field} />
			</Wrapper>,
		);
		expect(
			screen.getByRole("button", { name: /Upload file/ }),
		).toBeInTheDocument();
	});

	it("renders label and helper text", () => {
		render(
			<Wrapper adapters={{ media: createFakeMediaAdapter() }}>
				<MediaField field={field} />
			</Wrapper>,
		);
		expect(screen.getByText(/Featured Image/)).toBeInTheDocument();
		expect(screen.getByText("Upload a featured image")).toBeInTheDocument();
	});

	it("hides upload, picker and remove buttons when readOnly", async () => {
		render(
			<Wrapper
				adapters={{ media: createFakeMediaAdapter() }}
				defaultValues={{ [ACCESSOR]: ["asset-photo"] }}
			>
				<MediaField field={field} readOnly />
			</Wrapper>,
		);
		expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Upload file/ }),
		).not.toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /Remove/ }),
		).not.toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(MediaField.displayName).toBe("MediaField");
	});

	describe("naming stored ids through resolve", () => {
		it("shows each stored id by name, type and size", async () => {
			const media = createFakeMediaAdapter();
			render(
				<Wrapper
					adapters={{ media }}
					defaultValues={{ [ACCESSOR]: ["asset-gazette", "asset-photo"] }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);

			expect(
				await screen.findByText("gazette-2026-41.pdf"),
			).toBeInTheDocument();
			expect(screen.getByText("application/pdf · 1.2 MB")).toBeInTheDocument();
			expect(screen.getByText("photo.jpg")).toBeInTheDocument();
			expect(screen.getByText("image/jpeg · 512 B")).toBeInTheDocument();
			// One batch for both ids.
			expect(media.resolve).toHaveBeenCalledTimes(1);
			expect(media.resolve).toHaveBeenCalledWith([
				"asset-gazette",
				"asset-photo",
			]);
		});

		it("marks a deleted asset as deleted, and it stays removable", async () => {
			const user = userEvent.setup();
			render(
				<Wrapper
					adapters={{ media: createFakeMediaAdapter() }}
					defaultValues={{ [ACCESSOR]: ["asset-gone"] }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);

			expect(await screen.findByText("withdrawn.pdf")).toBeInTheDocument();
			expect(screen.getByText("Deleted")).toBeInTheDocument();
			await user.click(
				screen.getByRole("button", { name: "Remove withdrawn.pdf" }),
			);
			expect(stored()).toEqual([]);
		});

		it("shows an id the adapter leaves out as itself", async () => {
			render(
				<Wrapper
					adapters={{ media: createFakeMediaAdapter() }}
					defaultValues={{ [ACCESSOR]: ["asset-unknown", "asset-photo"] }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);

			expect(await screen.findByText("photo.jpg")).toBeInTheDocument();
			expect(screen.getByText("asset-unknown")).toBeInTheDocument();
		});

		it("shows every id as itself without resolve", () => {
			render(
				<Wrapper
					adapters={{
						media: createFakeMediaAdapter({ withoutResolve: true }),
					}}
					defaultValues={{ [ACCESSOR]: ["asset-photo"] }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);
			expect(screen.getByText("asset-photo")).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Remove asset-photo" }),
			).toBeInTheDocument();
		});

		it("shows ids as themselves when resolve fails, and reports it", async () => {
			const onError = vi.fn();
			const media = {
				...createFakeMediaAdapter(),
				resolve: vi.fn().mockRejectedValue(new Error("down")),
			};
			render(
				<Wrapper
					adapters={{ media }}
					onError={onError}
					defaultValues={{ [ACCESSOR]: ["asset-photo"] }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);
			await waitFor(() =>
				expect(onError).toHaveBeenCalledWith(expect.any(Error), ACCESSOR),
			);
			expect(screen.getByText("asset-photo")).toBeInTheDocument();
		});
	});

	it("calls no browse on mount", async () => {
		const media = createFakeMediaAdapter();
		render(
			<Wrapper
				adapters={{ media }}
				defaultValues={{ [ACCESSOR]: ["asset-photo"] }}
			>
				<MediaField field={field} />
			</Wrapper>,
		);
		// Wait for the mount's one adapter call to land, then check browse.
		await screen.findByText("photo.jpg");
		expect(media.browse).not.toHaveBeenCalled();
	});

	describe("picking an existing asset", () => {
		it("searches browse with the query and the field's accept, and adds the pick", async () => {
			const user = userEvent.setup();
			const media = createFakeMediaAdapter();
			render(
				<Wrapper adapters={{ media }}>
					<MediaField field={makeField({ accept: ["application/pdf"] })} />
				</Wrapper>,
			);

			await user.type(picker(), "marked");
			await waitFor(() =>
				expect(media.browse).toHaveBeenCalledWith({
					query: "marked",
					mime_types: ["application/pdf"],
				}),
			);
			// The typed query narrowed the offer to the one match.
			await waitFor(() =>
				expect(screen.queryByText("gazette-2026-41.pdf")).toBeNull(),
			);
			await user.click(await screen.findByText("marked-up.pdf"));

			expect(stored()).toEqual(["asset-markup"]);
			// Named from the pick itself, with no resolve round trip needed.
			expect(screen.getByText("application/pdf · 2.0 KB")).toBeInTheDocument();
		});

		it("sends no mime_types when the field accepts anything", async () => {
			const user = userEvent.setup();
			const media = createFakeMediaAdapter();
			render(
				<Wrapper adapters={{ media }}>
					<MediaField field={makeField()} />
				</Wrapper>,
			);

			await user.click(picker());
			await screen.findByText("photo.jpg");
			expect(media.browse).toHaveBeenLastCalledWith({ query: "" });
		});

		it("does not offer an asset the field already holds", async () => {
			const user = userEvent.setup();
			render(
				<Wrapper
					adapters={{ media: createFakeMediaAdapter() }}
					defaultValues={{ [ACCESSOR]: ["asset-markup"] }}
				>
					<MediaField field={makeField({ accept: ["application/pdf"] })} />
				</Wrapper>,
			);

			await screen.findByText("marked-up.pdf");
			await user.click(picker());
			expect(
				await screen.findByText("gazette-2026-41.pdf"),
			).toBeInTheDocument();
			expect(screen.getAllByText("marked-up.pdf")).toHaveLength(1);
		});

		it("stops adding at max_items: the picker and upload go away", async () => {
			const user = userEvent.setup();
			render(
				<Wrapper adapters={{ media: createFakeMediaAdapter() }}>
					<MediaField field={makeField({ max_items: 1 })} />
				</Wrapper>,
			);

			await user.click(picker());
			await user.click(await screen.findByText("photo.jpg"));

			expect(stored()).toEqual(["asset-photo"]);
			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: /Upload file/ }),
			).not.toBeInTheDocument();
		});

		it("offers upload only when the adapter cannot browse", () => {
			render(
				<Wrapper
					adapters={{ media: createFakeMediaAdapter({ withoutBrowse: true }) }}
				>
					<MediaField field={makeField()} />
				</Wrapper>,
			);
			expect(
				screen.getByRole("button", { name: /Upload file/ }),
			).toBeInTheDocument();
			expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		});
	});

	describe("uploading", () => {
		it("passes the field as upload's second argument and adds the asset", async () => {
			const user = userEvent.setup();
			const media = createFakeMediaAdapter();
			const target = makeField({ accept: ["application/pdf"] });
			render(
				<Wrapper adapters={{ media }}>
					<MediaField field={target} />
				</Wrapper>,
			);

			const file = new File(["%PDF"], "draft.pdf", {
				type: "application/pdf",
			});
			await user.upload(screen.getByTestId(`${ACCESSOR}-file-input`), file);

			await waitFor(() => expect(stored()).toEqual(["asset-upload-1"]));
			expect(media.upload).toHaveBeenCalledWith(file, { field: target });
			expect(screen.getByText("draft.pdf")).toBeInTheDocument();
		});

		it("says an upload failed rather than swallowing it", async () => {
			const user = userEvent.setup();
			const onError = vi.fn();
			const media = {
				...createFakeMediaAdapter(),
				upload: vi.fn().mockRejectedValue(new Error("quota")),
			};
			render(
				<Wrapper adapters={{ media }} onError={onError}>
					<MediaField field={makeField()} />
				</Wrapper>,
			);

			await user.upload(
				screen.getByTestId(`${ACCESSOR}-file-input`),
				new File(["x"], "x.txt", { type: "text/plain" }),
			);
			expect(await screen.findByText("Upload failed")).toBeInTheDocument();
			expect(onError).toHaveBeenCalled();
			expect(stored()).toEqual([]);
		});
	});
});
