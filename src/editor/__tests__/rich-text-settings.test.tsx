import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { Field } from "../../schema/types";
import {
	createFakePickerSource,
	fakeTextTypeAdapter,
} from "../../test/fake-picker-adapters";
import { RichTextSettingsEditor } from "../field-settings/rich-text-settings";

/** A Consumer whose `textType` Adapter searches (ADR-0027). */
function searchingAdapter(): FieldKitAdapters {
	return {
		textType: fakeTextTypeAdapter(
			createFakePickerSource({
				choices: [
					{ id: "article@3", name: "Article" },
					{ id: "note@1", name: "Note" },
				],
			}),
		),
	};
}

const BODY: Field<RichTextSettings> = {
	field_type: "rich_text",
	config: { name: "Body", api_accessor: "body", required: false },
	settings: {},
	system: false,
};

function renderEditor({
	initial = {},
	adapters = {},
}: {
	initial?: RichTextSettings;
	adapters?: FieldKitAdapters;
} = {}) {
	const onChange = vi.fn();
	function Harness() {
		const [settings, setSettings] = useState(initial);
		return (
			<RichTextSettingsEditor
				settings={settings}
				field={BODY}
				onChange={(next) => {
					onChange(next);
					setSettings(next);
				}}
			/>
		);
	}
	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters}>
				<Harness />
			</FieldKitProvider>
		</ChakraProvider>,
	);
	return { onChange };
}

describe("RichTextSettingsEditor", () => {
	it("pins the Text Type Release the Author picks from the adapter's search", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({ adapters: searchingAdapter() });

		await user.click(await screen.findByLabelText(/Text Type/));
		await user.click(await screen.findByText("Note"));

		expect(onChange).toHaveBeenLastCalledWith({ text_type: "note@1" });
	});

	it("shows the pinned Text Type by name", async () => {
		renderEditor({
			initial: { text_type: "article@3" },
			adapters: searchingAdapter(),
		});
		expect(await screen.findByText("Article")).toBeInTheDocument();
	});

	it("offers no Text Type input without a textType search", () => {
		renderEditor({
			initial: { text_type: "article@3", view_mode: "compact" },
			adapters: { textType: { get: vi.fn() } },
		});

		expect(
			screen.getByTestId("rich-text-text-type-unavailable"),
		).toHaveTextContent("article@3");
		expect(screen.queryByLabelText(/Text Type/)).toBeNull();
	});
});
