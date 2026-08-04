// src/editor/__tests__/blueprint-picker.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BlueprintSummary } from "../../renderer/adapters";
import { fieldsetPlugin } from "../../schema/field-types/fieldset";
import type { Field, Schema } from "../../schema/types";
import { DEFAULT_EDITOR_LABELS, SpecEditor } from "../spec-editor";
import { EditorWrap, testPlugins } from "./editor-helpers";

const L = DEFAULT_EDITOR_LABELS;

const BLUEPRINTS: BlueprintSummary[] = [
	{ id: "address_bp", name: "Address" },
	{ id: "contributor_bp", name: "Contributor" },
];

const plugins = [...testPlugins, fieldsetPlugin];

function fieldset(settings: Record<string, unknown> = {}): Field {
	return {
		field_type: "fieldset",
		config: {
			name: "Address",
			api_accessor: "address",
			required: false,
			instructions: "",
		},
		settings: { collapsible: false, ...settings },
		system: false,
	};
}

/**
 * #52's last acceptance criterion — "Selecting a Blueprint updates the draft
 * Spec". The panel applies each settings change straight to the draft, so the
 * only place an Author can observe it is what Save commits.
 */
describe("picking a fieldset's blueprint in the editor", () => {
	it("carries the picked blueprint into the saved spec", async () => {
		const user = userEvent.setup();
		const onCommit = vi.fn();
		const adapters = {
			blueprint: {
				getSchema: vi.fn().mockResolvedValue([]),
				getData: vi.fn(),
				list: vi.fn().mockResolvedValue(BLUEPRINTS),
			},
		};

		render(
			<EditorWrap plugins={plugins} adapters={adapters}>
				<SpecEditor
					schema={[fieldset()]}
					onCommit={onCommit}
					plugins={plugins}
				/>
			</EditorWrap>,
		);

		await user.click(screen.getByTestId("shell-address"));
		await user.click(screen.getByText(L.panelTabType));
		await user.click(await screen.findByLabelText(/Blueprint/));
		await user.click(await screen.findByText("Contributor"));
		await user.click(screen.getByText(L.save));

		await waitFor(() => expect(onCommit).toHaveBeenCalled());

		const saved = onCommit.mock.calls[0][0] as Schema;
		expect(saved[0].settings).toEqual({
			collapsible: false,
			blueprint: "contributor_bp",
		});
	});
});
