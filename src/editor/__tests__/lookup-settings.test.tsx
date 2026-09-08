import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LookupSettings } from "../../schema/field-types/lookup";
import { LookupSettingsEditor } from "../field-settings/lookup-settings";

function renderEditor(settings: LookupSettings | null = {}) {
	const onChange = vi.fn();
	render(
		<ChakraProvider value={defaultSystem}>
			<LookupSettingsEditor
				settings={settings as LookupSettings}
				onChange={onChange}
			/>
		</ChakraProvider>,
	);
	return { onChange, input: screen.getByLabelText(/Source/) };
}

describe("LookupSettingsEditor", () => {
	it("sets the Source id the Author enters", async () => {
		const user = userEvent.setup();
		const { onChange, input } = renderEditor();

		// Pasted rather than typed: `onChange` here is a spy, so the input never
		// re-renders with what went before, and typing would assert only on the
		// last keystroke. One change carrying the whole id is what the panel
		// actually receives.
		await user.click(input);
		await user.paste("layout:stylesheet");

		expect(onChange).toHaveBeenLastCalledWith({ source: "layout:stylesheet" });
	});

	it("shows the Source the Field already names", () => {
		const { input } = renderEditor({ source: "print:printer" });
		expect(input).toHaveValue("print:printer");
	});

	it("treats a cleared input as naming no Source", async () => {
		const user = userEvent.setup();
		const { onChange, input } = renderEditor({ source: "print:printer" });

		await user.clear(input);

		expect(onChange).toHaveBeenLastCalledWith({ source: "" });
	});

	it("keeps settings it does not own", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<ChakraProvider value={defaultSystem}>
				<LookupSettingsEditor
					settings={{ legacy_key: "kept" } as LookupSettings}
					onChange={onChange}
				/>
			</ChakraProvider>,
		);

		await user.click(screen.getByLabelText(/Source/));
		await user.paste("x");

		expect(onChange).toHaveBeenLastCalledWith({
			legacy_key: "kept",
			source: "x",
		});
	});

	it("tolerates absent settings", () => {
		const { input } = renderEditor(null);
		expect(input).toHaveValue("");
	});

	it("has displayName", () => {
		expect(LookupSettingsEditor.displayName).toBe("LookupSettingsEditor");
	});
});
