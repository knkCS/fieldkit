import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { EditorSpecData, FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { RichTextSettings } from "../../schema/field-types/rich-text";
import type { Field } from "../../schema/types";
import { RichTextSettingsEditor } from "../field-settings/rich-text-settings";

const TEXT_TYPES: EditorSpecData[] = [
	{ id: "article@3", name: "Article", nodes: {}, marks: {} },
	{ id: "note@1", name: "Note", nodes: {}, marks: {} },
];

function listingAdapter(): FieldKitAdapters {
	return {
		textType: {
			getEditorSpec: vi.fn(),
			getGlobalSettings: vi.fn(),
			listEditorSpecs: () => Promise.resolve(TEXT_TYPES),
		},
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
	return { onChange, textType: () => screen.getByLabelText(/Text Type/) };
}

describe("RichTextSettingsEditor", () => {
	it("pins the Text Type Release the Author picks from the adapter's list", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({ adapters: listingAdapter() });

		await user.click(await screen.findByLabelText(/Text Type/));
		await user.click(await screen.findByText("Note"));

		expect(onChange).toHaveBeenLastCalledWith({ text_type: "note@1" });
	});

	it("shows the pinned Text Type by name", async () => {
		renderEditor({
			initial: { text_type: "article@3" },
			adapters: listingAdapter(),
		});
		expect(await screen.findByText("Article")).toBeInTheDocument();
	});

	it("takes a Text Type Release id without a textType adapter", async () => {
		const user = userEvent.setup();
		const { onChange, textType } = renderEditor({
			initial: { view_mode: "compact" },
		});

		await user.type(textType(), "article@3");

		expect(onChange).toHaveBeenLastCalledWith({
			view_mode: "compact",
			text_type: "article@3",
		});
	});
});
