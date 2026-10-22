// src/editor/__tests__/boolean-default.test.tsx
//
// A Boolean Field's default (#1859 in knkboor/general): the General tab
// offers it as an on/off control, and the Spec carries it as a boolean in
// `config.default_value` — the key every Field's default already lives under
// (getDefaultValues, formDefaults). Absent means off, today's behaviour.

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { builtInFieldTypes } from "../../schema/field-types";
import type { Field } from "../../schema/types";
import { FieldConfigPanel, type PanelLabels } from "../field-config-panel";
import { EditorWrap, makeField } from "./editor-helpers";

const labels = {
	defaultValue: "Default value",
} as unknown as PanelLabels;

function booleanField(default_value?: unknown): Field {
	const field = makeField("active", "Active");
	return {
		...field,
		field_type: "boolean",
		config: {
			...field.config,
			...(default_value === undefined ? {} : { default_value }),
		},
	};
}

function Harness({ initialField }: { initialField: Field }) {
	const [field, setField] = useState<Field>(initialField);
	const plugin = builtInFieldTypes.find((p) => p.id === field.field_type);
	return (
		<div>
			<FieldConfigPanel
				field={field}
				plugin={plugin}
				plugins={builtInFieldTypes}
				draft={[field]}
				fieldErrors={[]}
				onFieldChange={setField}
				onClose={() => {}}
				committedAccessors={new Set()}
				baselineAccessor={initialField.config.api_accessor}
				labels={labels}
			/>
			<pre data-testid="dump">{JSON.stringify(field)}</pre>
		</div>
	);
}

function readDump(): Field {
	return JSON.parse(screen.getByTestId("dump").textContent ?? "null");
}

function control(): HTMLInputElement {
	return screen.getByTestId("panel-default-input") as HTMLInputElement;
}

describe("Boolean Field default in the General tab", () => {
	it("offers the default as an on/off control, off when the Spec has none", () => {
		render(
			<EditorWrap>
				<Harness initialField={booleanField()} />
			</EditorWrap>,
		);
		expect(control().type).toBe("checkbox");
		expect(control().checked).toBe(false);
		expect(screen.getByText("Default value")).toBeInTheDocument();
	});

	it("switching it on stores the boolean true, not a string", () => {
		render(
			<EditorWrap>
				<Harness initialField={booleanField()} />
			</EditorWrap>,
		);
		fireEvent.click(control());
		expect(readDump().config.default_value).toBe(true);
	});

	it("switching it off removes the key: absent is off, one state stored one way", () => {
		render(
			<EditorWrap>
				<Harness initialField={booleanField(true)} />
			</EditorWrap>,
		);
		expect(control().checked).toBe(true);
		fireEvent.click(control());
		expect(readDump().config).not.toHaveProperty("default_value");
	});

	it("reads a stored false as off", () => {
		render(
			<EditorWrap>
				<Harness initialField={booleanField(false)} />
			</EditorWrap>,
		);
		expect(control().checked).toBe(false);
	});

	it("leaves every other type's default a text input", () => {
		const text = makeField("title", "Title");
		render(
			<EditorWrap>
				<Harness initialField={text} />
			</EditorWrap>,
		);
		expect(control().type).toBe("text");
		fireEvent.change(control(), { target: { value: "Untitled" } });
		expect(readDump().config.default_value).toBe("Untitled");
	});
});
