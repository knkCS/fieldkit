import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field, Schema } from "../../schema/types";
import { SpecEditor } from "../spec-editor";
import { TryItView } from "../try-it-view";

// anker popovers/tooltips need ResizeObserver (unimplemented in jsdom).
class MockResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
beforeEach(() => {
	vi.stubGlobal("ResizeObserver", MockResizeObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

function textField(accessor: string, required: boolean): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

function sectionField(accessor: string): Field {
	return {
		field_type: "section",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: {},
		system: false,
	};
}

function Wrap({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={builtInFieldTypes}>
				{children}
			</FieldKitProvider>
		</ChakraProvider>
	);
}

const mostlyRequired: Schema = [
	textField("a", true),
	textField("b", true),
	textField("c", false),
];
const mostlyOptional: Schema = [
	textField("a", true),
	textField("b", false),
	textField("c", false),
];

describe("EditorCanvas — §10 markers (WYSIWYG)", () => {
	it("mostly-required draft: canvas previews show the optional marker, no asterisks", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={mostlyRequired}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("mostly-optional draft: canvas previews show the asterisk", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={mostlyOptional}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("*")).toBeInTheDocument();
		expect(screen.queryByText("(optional)")).toBeNull();
	});

	it("sectioned draft: canvas previews follow the convention through the tabs branch", () => {
		render(
			<Wrap>
				<SpecEditor
					schema={[sectionField("s1"), ...mostlyRequired]}
					onCommit={vi.fn()}
					plugins={builtInFieldTypes}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});
});

describe("TryItView — §10 markers", () => {
	const tryItLabels = {
		testSubmit: "Test submit",
		testSubmitSuccess: "OK",
	};

	it("applies the convention through the real SpecForm", () => {
		render(
			<Wrap>
				<TryItView
					schema={mostlyRequired}
					plugins={builtInFieldTypes}
					labels={tryItLabels}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optional)")).toBeInTheDocument();
		expect(screen.queryByText("*")).toBeNull();
	});

	it("forwards a custom optionalMarker to SpecForm", () => {
		render(
			<Wrap>
				<TryItView
					schema={mostlyRequired}
					plugins={builtInFieldTypes}
					labels={{ ...tryItLabels, optionalMarker: "(optioneel)" }}
				/>
			</Wrap>,
		);
		expect(screen.getByText("(optioneel)")).toBeInTheDocument();
	});
});

describe("TryItView — label forwarding", () => {
	it("falls back to SpecForm defaults for omitted labels", () => {
		render(
			<Wrap>
				<TryItView
					schema={[sectionField("s1"), textField("a", false)]}
					plugins={builtInFieldTypes}
					labels={{ testSubmit: "Test submit", testSubmitSuccess: "OK" }}
				/>
			</Wrap>,
		);
		// Sectioned schema → SpecForm's tabbed path renders the field search;
		// its placeholder must be SpecForm's own default, not undefined.
		expect(screen.getByPlaceholderText("Find field…")).toBeInTheDocument();
	});
});
