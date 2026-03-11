// src/rich-text-spec/__tests__/editor-spec-editor.test.tsx

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../schema/types";
import { EditorSpecEditor } from "../editor-spec-editor";
import type { EditorNodePlugin, EditorSpec } from "../types";

const DummyIcon = ({ size: _size }: { size?: number | string }) => (
	<span>icon</span>
);

const boldPlugin: EditorNodePlugin = {
	id: "bold",
	name: "Bold",
	description: "Bold text",
	category: "formatting",
	isMark: true,
	defaultEnabled: true,
	icon: DummyIcon,
};

const italicPlugin: EditorNodePlugin = {
	id: "italic",
	name: "Italic",
	description: "Italic text",
	category: "formatting",
	isMark: true,
	defaultEnabled: true,
	icon: DummyIcon,
};

const headingSettingsField: Field = {
	field_type: "text",
	config: {
		name: "Levels",
		api_accessor: "levels",
		required: false,
		instructions: "Which heading levels",
	},
	settings: null,
	children: null,
	system: false,
};

const headingPlugin: EditorNodePlugin = {
	id: "heading",
	name: "Heading",
	description: "Section headings",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	settingsSpec: [headingSettingsField],
	defaultSettings: { levels: "1,2,3" },
	icon: DummyIcon,
};

const paragraphPlugin: EditorNodePlugin = {
	id: "paragraph",
	name: "Paragraph",
	description: "Text paragraph",
	category: "structure",
	isMark: false,
	defaultEnabled: true,
	icon: DummyIcon,
};

const imagePlugin: EditorNodePlugin = {
	id: "image",
	name: "Image",
	description: "Embedded image",
	category: "media",
	isMark: false,
	defaultEnabled: false,
	icon: DummyIcon,
};

const markPlugins = [boldPlugin, italicPlugin];
const nodePlugins = [headingPlugin, paragraphPlugin, imagePlugin];

function makeSpec(overrides?: Partial<EditorSpec>): EditorSpec {
	return {
		id: "test-spec",
		name: "Test Spec",
		nodes: { paragraph: {}, heading: { levels: "1,2,3" } },
		marks: { bold: {} },
		...overrides,
	};
}

describe("EditorSpecEditor", () => {
	it("renders plugin toggles grouped by category", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		expect(screen.getByTestId("editor-spec-editor")).toBeInTheDocument();
		expect(screen.getByTestId("category-formatting")).toBeInTheDocument();
		expect(screen.getByTestId("category-structure")).toBeInTheDocument();
		expect(screen.getByTestId("category-media")).toBeInTheDocument();
	});

	it("shows category headers", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		expect(screen.getByText("Formatting")).toBeInTheDocument();
		expect(screen.getByText("Structure")).toBeInTheDocument();
		expect(screen.getByText("Media")).toBeInTheDocument();
	});

	it("renders plugin names and descriptions", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		expect(screen.getByText("Bold")).toBeInTheDocument();
		expect(screen.getByText("Bold text")).toBeInTheDocument();
		expect(screen.getByText("Heading")).toBeInTheDocument();
		expect(screen.getByText("Image")).toBeInTheDocument();
	});

	it("shows enabled state for plugins present in spec", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		const boldToggle = screen.getByTestId("toggle-bold") as HTMLInputElement;
		const italicToggle = screen.getByTestId(
			"toggle-italic",
		) as HTMLInputElement;
		const paragraphToggle = screen.getByTestId(
			"toggle-paragraph",
		) as HTMLInputElement;
		const imageToggle = screen.getByTestId("toggle-image") as HTMLInputElement;

		expect(boldToggle.checked).toBe(true);
		expect(italicToggle.checked).toBe(false);
		expect(paragraphToggle.checked).toBe(true);
		expect(imageToggle.checked).toBe(false);
	});

	it("calls onChange with plugin added when toggling on a mark", () => {
		const onChange = vi.fn();
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={onChange}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		fireEvent.click(screen.getByTestId("toggle-italic"));

		expect(onChange).toHaveBeenCalledTimes(1);
		const newSpec = onChange.mock.calls[0][0] as EditorSpec;
		expect("italic" in newSpec.marks).toBe(true);
		// Bold should still be there
		expect("bold" in newSpec.marks).toBe(true);
	});

	it("calls onChange with plugin removed when toggling off a mark", () => {
		const onChange = vi.fn();
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={onChange}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		fireEvent.click(screen.getByTestId("toggle-bold"));

		expect(onChange).toHaveBeenCalledTimes(1);
		const newSpec = onChange.mock.calls[0][0] as EditorSpec;
		expect("bold" in newSpec.marks).toBe(false);
	});

	it("calls onChange with node added when toggling on a node", () => {
		const onChange = vi.fn();
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={onChange}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		fireEvent.click(screen.getByTestId("toggle-image"));

		expect(onChange).toHaveBeenCalledTimes(1);
		const newSpec = onChange.mock.calls[0][0] as EditorSpec;
		expect("image" in newSpec.nodes).toBe(true);
	});

	it("shows settings toggle for plugins with settingsSpec when enabled", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		// Heading is enabled and has settings, so the settings toggle should exist
		expect(screen.getByTestId("settings-toggle-heading")).toBeInTheDocument();
	});

	it("expands settings panel when settings toggle is clicked", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		fireEvent.click(screen.getByTestId("settings-toggle-heading"));

		expect(screen.getByTestId("settings-panel-heading")).toBeInTheDocument();
		expect(screen.getByTestId("setting-heading-levels")).toBeInTheDocument();
	});

	it("calls onChange when settings are changed", () => {
		const onChange = vi.fn();
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={onChange}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		// Expand settings
		fireEvent.click(screen.getByTestId("settings-toggle-heading"));

		// Change the levels setting
		const input = screen.getByTestId(
			"setting-heading-levels",
		) as HTMLInputElement;
		fireEvent.change(input, { target: { value: "1,2" } });

		expect(onChange).toHaveBeenCalledTimes(1);
		const newSpec = onChange.mock.calls[0][0] as EditorSpec;
		expect(newSpec.nodes.heading.levels).toBe("1,2");
	});

	it("does not show settings toggle for plugins without settingsSpec", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		expect(
			screen.queryByTestId("settings-toggle-bold"),
		).not.toBeInTheDocument();
		expect(
			screen.queryByTestId("settings-toggle-paragraph"),
		).not.toBeInTheDocument();
	});

	it("does not render categories with no plugins", () => {
		render(
			<EditorSpecEditor
				spec={makeSpec()}
				onChange={vi.fn()}
				nodePlugins={nodePlugins}
				markPlugins={markPlugins}
			/>,
		);

		// "reference" and "special" categories have no plugins in our test data
		expect(screen.queryByTestId("category-reference")).not.toBeInTheDocument();
		expect(screen.queryByTestId("category-special")).not.toBeInTheDocument();
	});

	it("has displayName set", () => {
		expect(EditorSpecEditor.displayName).toBe("EditorSpecEditor");
	});
});
