import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Toaster, toaster } from "@knkcs/anker/primitives";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FieldKitProvider } from "../../renderer/provider";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import { SpecEditor } from "../spec-editor";

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

function textField(accessor: string): Field {
	return {
		field_type: "text",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: null,
		system: false,
	};
}

describe("SpecEditor + host Toaster (#28)", () => {
	it("a toast renders exactly once despite the editor's internal Toaster", async () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<Toaster />
				<FieldKitProvider plugins={builtInFieldTypes}>
					<SpecEditor
						schema={[textField("a")]}
						onCommit={vi.fn()}
						plugins={builtInFieldTypes}
					/>
				</FieldKitProvider>
			</ChakraProvider>,
		);
		// Region-level check: the shared singleton store renders into every
		// mounted region, so creating any toast directly exercises exactly
		// the #28 mechanism (host region + SpecEditor's internal one).
		await act(async () => {
			toaster.create({ title: "host-fixture-toast", duration: 60_000 });
		});
		expect(await screen.findAllByText("host-fixture-toast")).toHaveLength(1);
	});
});
