import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FieldKitAdapters } from "../../../renderer/adapters";
import { FieldKitProvider } from "../../../renderer/provider";
import type { Field } from "../../../schema/types";
import { createFakeMediaAdapter } from "../../../test/fake-media-adapter";
import { MediaCell } from "../media-cell";

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "media",
	config: {
		name: "Test",
		api_accessor: "test",
		required: false,
		instructions: "",
		...overrides?.config,
	},
	settings: null,
	system: false,
});

describe("MediaCell", () => {
	it("renders file count for array", () => {
		render(<MediaCell field={makeField()} value={[{}, {}, {}]} />);
		expect(screen.getByText("3 files")).toBeDefined();
	});

	it("renders singular for 1 file", () => {
		render(<MediaCell field={makeField()} value={[{}]} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders 1 file for single object", () => {
		render(<MediaCell field={makeField()} value={{ id: "1" }} />);
		expect(screen.getByText("1 file")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<MediaCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty array", () => {
		render(<MediaCell field={makeField()} value={[]} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});

describe("MediaCell with the adapter's resolve", () => {
	function renderWith(
		value: unknown,
		media: FieldKitAdapters["media"] = createFakeMediaAdapter(),
	) {
		return render(
			<ChakraProvider value={defaultSystem}>
				<FieldKitProvider plugins={[]} adapters={{ media }}>
					<MediaCell field={makeField()} value={value} />
				</FieldKitProvider>
			</ChakraProvider>,
		);
	}

	it("names its ids, a deleted asset marked and an unknown id as itself", async () => {
		const media = createFakeMediaAdapter();
		renderWith(["asset-gazette", "asset-gone", "asset-unknown"], media);
		expect(
			await screen.findByText(
				"gazette-2026-41.pdf, withdrawn.pdf (deleted), asset-unknown",
			),
		).toBeDefined();
		expect(media.resolve).toHaveBeenCalledWith([
			"asset-gazette",
			"asset-gone",
			"asset-unknown",
		]);
	});

	it("counts the files while the names are on their way", () => {
		renderWith(["asset-gazette", "asset-photo"], {
			...createFakeMediaAdapter(),
			resolve: () => new Promise(() => {}),
		});
		expect(screen.getByText("2 files")).toBeDefined();
	});

	it("counts the files without resolve", () => {
		renderWith(
			["asset-gazette"],
			createFakeMediaAdapter({ withoutResolve: true }),
		);
		expect(screen.getByText("1 file")).toBeDefined();
	});
});
