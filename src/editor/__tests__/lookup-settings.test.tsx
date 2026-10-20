// src/editor/__tests__/lookup-settings.test.tsx
//
// The Lookup settings editor offers the Source ids the host registered on
// `adapters.lookup` (blueprinthub ADR 0009) in its three states: Sources to
// pick from, a stored id none of them is, and no Sources at all.
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FieldKitAdapters, LookupSource } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { LookupSettings } from "../../schema/field-types/lookup";
import {
	DEFAULT_LOOKUP_SETTINGS_LABELS,
	LookupSettingsEditor,
	type LookupSettingsLabels,
} from "../field-settings/lookup-settings";

const L = DEFAULT_LOOKUP_SETTINGS_LABELS;

/** A Source that never answers: the settings editor only reads the keys. */
const source = (): LookupSource => ({
	search: () => Promise.resolve({ items: [], total: 0 }),
});

const TWO_SOURCES: FieldKitAdapters["lookup"] = {
	"layout:stylesheet": source(),
	"print:printer": source(),
};

function renderEditor(
	settings: LookupSettings | null,
	adapters: FieldKitAdapters = { lookup: TWO_SOURCES },
	labels?: Partial<LookupSettingsLabels>,
) {
	const onChange = vi.fn();
	render(
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={[]} adapters={adapters}>
				<LookupSettingsEditor
					settings={settings as LookupSettings}
					onChange={onChange}
					labels={labels}
				/>
			</FieldKitProvider>
		</ChakraProvider>,
	);
	return { onChange };
}

const input = () => screen.getByLabelText(L.source);

/** What the select shows as chosen — react-select renders it beside the
 * input, inside the control the test id marks. */
const shown = () => screen.getByTestId("lookup-source-select").textContent;

const optionTexts = () =>
	screen.getAllByRole("option").map((option) => option.textContent);

describe("LookupSettingsEditor — registered Sources", () => {
	it("offers every Source id the host registered", async () => {
		const user = userEvent.setup();
		renderEditor({});

		await user.click(input());

		expect(optionTexts()).toEqual(["layout:stylesheet", "print:printer"]);
	});

	it("sets the Source the Author picks", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({});

		await user.click(input());
		await user.click(screen.getByRole("option", { name: "print:printer" }));

		expect(onChange).toHaveBeenLastCalledWith({ source: "print:printer" });
	});

	it("shows the registered Source the Field already names, with no warning", () => {
		renderEditor({ source: "layout:stylesheet" });

		expect(shown()).toContain("layout:stylesheet");
		expect(screen.queryByText(L.sourceNotRegistered)).toBeNull();
	});

	it("treats a cleared select as naming no Source", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({ source: "print:printer" });

		// react-select clears on Backspace in an empty input when clearable.
		await user.click(input());
		await user.keyboard("{Escape}{Backspace}");

		expect(onChange).toHaveBeenLastCalledWith({ source: "" });
	});

	it("keeps settings it does not own", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({
			legacy_key: "kept",
		} as LookupSettings);

		await user.click(input());
		await user.click(screen.getByRole("option", { name: "layout:stylesheet" }));

		expect(onChange).toHaveBeenLastCalledWith({
			legacy_key: "kept",
			source: "layout:stylesheet",
		});
	});

	it("tolerates absent settings", () => {
		renderEditor(null);
		expect(screen.getByText(L.sourcePlaceholder)).toBeInTheDocument();
	});
});

describe("LookupSettingsEditor — a stored id that isn't registered", () => {
	it("shows the id as stored, raw, with a warning", () => {
		const { onChange } = renderEditor({ source: "legacy:thing" });

		expect(shown()).toContain("legacy:thing");
		expect(screen.getByText(L.sourceNotRegistered)).toBeInTheDocument();
		// Showing it is not rewriting it.
		expect(onChange).not.toHaveBeenCalled();
	});

	it("still offers the registered Sources to move to", async () => {
		const user = userEvent.setup();
		const { onChange } = renderEditor({ source: "legacy:thing" });

		await user.click(input());
		// The stored id is the value, never an option: offering it would say
		// the host can serve it.
		expect(optionTexts()).toEqual(["layout:stylesheet", "print:printer"]);

		await user.click(screen.getByRole("option", { name: "print:printer" }));
		expect(onChange).toHaveBeenLastCalledWith({ source: "print:printer" });
	});
});

describe("LookupSettingsEditor — no Sources registered", () => {
	it.each([
		["an empty record", { lookup: {} }],
		["no lookup adapter", {}],
	])("says so with %s, and leaves the setting alone", (_, adapters) => {
		const { onChange } = renderEditor(
			{ source: "layout:stylesheet" },
			adapters as FieldKitAdapters,
		);

		expect(screen.getByText(L.noSourcesRegistered)).toBeInTheDocument();
		// The stored id still reads as stored; there is just nothing to pick.
		expect(shown()).toContain("layout:stylesheet");
		expect(input()).toBeDisabled();
		expect(onChange).not.toHaveBeenCalled();
		// One message, not two: "not registered here" is implied by "nothing is".
		expect(screen.queryByText(L.sourceNotRegistered)).toBeNull();
	});

	it("renders outside a FieldKitProvider as having no Sources", () => {
		render(
			<ChakraProvider value={defaultSystem}>
				<LookupSettingsEditor settings={{ source: "" }} onChange={vi.fn()} />
			</ChakraProvider>,
		);
		expect(screen.getByText(L.noSourcesRegistered)).toBeInTheDocument();
	});
});

describe("LookupSettingsEditor — labels", () => {
	it("renders the labels it is given over the English defaults", () => {
		renderEditor({ source: "legacy:thing" }, undefined, {
			source: "Quelle",
			sourceNotRegistered: "Hier nicht registriert.",
		});

		expect(screen.getByLabelText("Quelle")).toBeInTheDocument();
		expect(screen.getByText("Hier nicht registriert.")).toBeInTheDocument();
	});

	it("keeps the default of every label it is not given", () => {
		renderEditor({}, undefined, { source: "Quelle" });

		expect(screen.getByText(L.sourcePlaceholder)).toBeInTheDocument();
		expect(screen.getByText(L.sourceHelper)).toBeInTheDocument();
	});

	it("has displayName", () => {
		expect(LookupSettingsEditor.displayName).toBe("LookupSettingsEditor");
	});
});
