import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DateSettings } from "../../schema/field-types/date";
import { datePlugin } from "../../schema/field-types/date";
import type { Field, LockedSetting } from "../../schema/types";
import { DateSettingsEditor } from "../field-settings/date-settings";
import { SettingLockProvider } from "../field-settings/setting-lock";

const DUE: Field<DateSettings> = {
	field_type: "date",
	config: {
		name: "Due",
		api_accessor: "due",
		required: false,
		instructions: "",
	},
	settings: {},
	system: false,
};

function renderEditor(
	initial: DateSettings = {},
	locked: LockedSetting[] | undefined = undefined,
) {
	const onChange = vi.fn();
	function Harness() {
		const [settings, setSettings] = useState<DateSettings>(initial);
		return (
			<>
				<DateSettingsEditor
					settings={settings}
					field={DUE}
					onChange={(next) => {
						onChange(next);
						setSettings(next);
					}}
				/>
				<pre data-testid="dump">{JSON.stringify(settings)}</pre>
			</>
		);
	}
	render(
		<ChakraProvider value={defaultSystem}>
			<SettingLockProvider locked={locked}>
				<Harness />
			</SettingLockProvider>
		</ChakraProvider>,
	);
	return { onChange };
}

function dump(): DateSettings {
	return JSON.parse(screen.getByTestId("dump").textContent ?? "{}");
}

describe("DateSettingsEditor", () => {
	it("is the date type's settings component", () => {
		expect(datePlugin.settingsComponent).toBe(DateSettingsEditor);
	});

	it("edits min_date and max_date through date pickers", () => {
		renderEditor();
		const min = screen.getByLabelText(/earliest date/i);
		const max = screen.getByLabelText(/latest date/i);
		expect(min).toHaveAttribute("type", "date");
		expect(max).toHaveAttribute("type", "date");

		fireEvent.change(min, { target: { value: "2026-01-01" } });
		fireEvent.change(max, { target: { value: "2026-12-31" } });
		expect(dump()).toEqual({ min_date: "2026-01-01", max_date: "2026-12-31" });
	});

	it("shows the stored limits, and bounds each picker by the other", () => {
		renderEditor({ min_date: "2026-03-01", max_date: "2026-04-01" });
		const min = screen.getByLabelText(/earliest date/i);
		const max = screen.getByLabelText(/latest date/i);
		expect(min).toHaveValue("2026-03-01");
		expect(max).toHaveValue("2026-04-01");
		expect(min).toHaveAttribute("max", "2026-04-01");
		expect(max).toHaveAttribute("min", "2026-03-01");
	});

	it("clears a limit to absent, not an empty string (ADR-0021)", () => {
		renderEditor({ min_date: "2026-03-01", enable_range: true });
		fireEvent.change(screen.getByLabelText(/earliest date/i), {
			target: { value: "" },
		});
		expect(dump()).toEqual({ enable_range: true });
	});

	it("reports a latest date before the earliest", () => {
		renderEditor({ min_date: "2026-03-01" });
		expect(screen.queryByText(/on or after the earliest/i)).toBeNull();
		fireEvent.change(screen.getByLabelText(/latest date/i), {
			target: { value: "2026-02-01" },
		});
		expect(screen.getByText(/on or after the earliest/i)).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText(/latest date/i), {
			target: { value: "2026-03-01" },
		});
		expect(screen.queryByText(/on or after the earliest/i)).toBeNull();
	});

	it("toggles enable_range and says the limits bound both ends of a range", async () => {
		renderEditor({ min_date: "2026-03-01" });
		expect(screen.queryByText(/both ends of the range/i)).toBeNull();
		await userEvent.click(
			screen.getByRole("checkbox", { name: /date range/i }),
		);
		expect(dump()).toEqual({ min_date: "2026-03-01", enable_range: true });
		expect(
			screen.getAllByText(/both ends of the range/i).length,
		).toBeGreaterThan(0);
	});

	it("honours a locked setting (ADR-0011)", () => {
		renderEditor({ max_date: "2026-04-01" }, [
			{ key: "max_date", reason: "Contents already use this limit" },
		]);
		expect(screen.getByLabelText(/latest date/i)).toBeDisabled();
		expect(screen.getByLabelText(/earliest date/i)).not.toBeDisabled();
		expect(
			screen.getByText("Contents already use this limit"),
		).toBeInTheDocument();
	});
});
