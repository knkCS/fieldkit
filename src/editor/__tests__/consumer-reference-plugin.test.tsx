// src/editor/__tests__/consumer-reference-plugin.test.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BookOpen } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { createReferencePlugin } from "../../schema/field-types/reference";
import type { FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";
import { createFakeReferenceAdapter } from "../../test/fake-reference-adapter";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { TypePicker } from "../type-picker";
import { CanvasHarness, EditorWrap, testPlugins } from "./editor-helpers";

/**
 * `toc_reference`, minted by the Consumer that gives it meaning (ADR-0010).
 *
 * The type left fieldkit's catalogue, and with it `maxPerSpec`'s only in-tree
 * user. `max-per-spec.test.tsx` still holds the machinery to a stub plugin;
 * what is asserted here is the case the ADR actually leaves behind — a real
 * reference-shaped type the editor learns about at runtime, capped at one.
 */
const tocReferencePlugin = createReferencePlugin({
	id: "toc_reference",
	name: "TOC Reference",
	description: "The publication tree this Content hangs in",
	icon: BookOpen,
	maxPerSpec: 1,
	availableIn: ["blueprint"],
});

const PLUGINS: FieldTypePlugin[] = [...testPlugins, tocReferencePlugin];

function tocField(accessor: string): Field {
	return {
		field_type: "toc_reference",
		config: {
			name: accessor,
			api_accessor: accessor,
			required: false,
			instructions: "",
		},
		settings: { blueprints: [] },
		children: null,
		system: false,
	};
}

function renderInEditor(children: React.ReactNode) {
	return render(
		<EditorWrap
			plugins={PLUGINS}
			adapters={{ reference: createFakeReferenceAdapter() }}
		>
			{children}
		</EditorWrap>,
	);
}

function renderPicker(currentSpec: Field[]) {
	return render(
		<ChakraProvider value={defaultSystem}>
			<TypePicker
				plugins={PLUGINS}
				currentSpec={currentSpec}
				onSelect={vi.fn()}
			/>
		</ChakraProvider>,
	);
}

describe("a Consumer-registered reference-shaped plugin, in the editor", () => {
	it("renders the minted type's own Field on the canvas", async () => {
		renderInEditor(
			<CanvasHarness schema={[tocField("toc")]} plugins={PLUGINS} />,
		);

		// The tree Field itself, not a fallback: fieldkit resolves a Consumer's
		// plugin through the registry exactly as it does a built-in one.
		expect(
			await screen.findByRole("button", { name: "Add reference" }),
		).toBeInTheDocument();
	});

	describe("its maxPerSpec is enforced on every surface", () => {
		it("greys the type out in the picker once the Spec holds one", () => {
			renderPicker([tocField("toc")]);

			const card = screen.getByTestId("type-option-toc_reference");
			expect(card).toBeDisabled();
			expect(card).toHaveAttribute("title", "Limit reached (max 1)");
		});

		it("offers it in the picker while the Spec holds none", () => {
			renderPicker([]);

			expect(
				screen.getByTestId("type-option-toc_reference"),
			).not.toBeDisabled();
		});

		it("blocks duplicating it on the canvas", () => {
			renderInEditor(
				<CanvasHarness schema={[tocField("toc")]} plugins={PLUGINS} />,
			);

			fireEvent.click(screen.getByTestId("shell-toc"));
			expect(screen.getByLabelText("Duplicate field")).toBeDisabled();
		});

		it("reports a second instance and refuses to save", () => {
			renderInEditor(
				<SpecEditor
					schema={[tocField("toc"), tocField("toc_2")]}
					onCommit={vi.fn()}
					plugins={PLUGINS}
				/>,
			);

			expect(screen.getByRole("alert")).toHaveTextContent(/TOC Reference/);
			expect(screen.getByRole("alert")).toHaveTextContent(/limited to 1/i);
			expect(
				screen.getByRole("button", { name: DEFAULT_EDITOR_LABELS.save }),
			).toBeDisabled();
		});
	});
});
