// src/editor/__tests__/editor-helpers.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { ConfirmModalProvider } from "@knkcs/anker/feedback";
import { type ReactNode, useState } from "react";
import { vi } from "vitest";
import { z } from "zod";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field, Schema } from "../../schema/types";
import { type CanvasLabels, EditorCanvas } from "../editor-canvas";
import { DEFAULT_EDITOR_LABELS } from "../spec-editor";
import { useSpecDraft } from "../use-spec-draft";

export function makeField(accessor: string, name = accessor): Field {
	return {
		field_type: "text",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: null,
		system: false,
	};
}

export function makeSection(accessor: string, name = accessor): Field {
	return {
		field_type: "section",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

export function makeCard(accessor: string, name = ""): Field {
	return {
		field_type: "card",
		config: { name, api_accessor: accessor, required: false, instructions: "" },
		settings: {},
		system: false,
	};
}

function TestField({ field }: FieldProps) {
	return (
		<input
			data-testid={`field-${field.config.api_accessor}`}
			aria-label={field.config.name}
		/>
	);
}
TestField.displayName = "TestField";

export const testPlugins: FieldTypePlugin[] = [
	{
		id: "text",
		name: "Text",
		description: "Plain text",
		icon: () => null,
		category: "text",
		fieldComponent: TestField,
		toZodType: () => z.string(),
	},
	{
		id: "section",
		name: "Section",
		description: "Structural",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
	{
		id: "card",
		name: "Card",
		description: "Structural",
		icon: () => null,
		category: "structural",
		fieldComponent: () => null,
		toZodType: () => z.never(),
	},
];

export function EditorWrap({
	children,
	plugins = testPlugins,
	adapters,
}: {
	children: ReactNode;
	/** Defaults to the stub trio above; pass real plugins when the test needs
	 * a plugin's own settings editor (e.g. the fieldset blueprint picker). */
	plugins?: FieldTypePlugin[];
	adapters?: FieldKitAdapters;
}) {
	return (
		<ChakraProvider value={defaultSystem}>
			<FieldKitProvider plugins={plugins} adapters={adapters}>
				{children}
			</FieldKitProvider>
		</ChakraProvider>
	);
}

/**
 * A full set of canvas labels, so a test asserting on one affordance does not
 * have to spell out the other thirty.
 *
 * The shipped defaults rather than a hand-rolled copy: a test that asserts
 * "Duplicate field" is then asserting the string a Consumer sees, and a label
 * key added later cannot leave this fixture quietly incomplete.
 */
export const CANVAS_LABELS: CanvasLabels = DEFAULT_EDITOR_LABELS;

/**
 * An `EditorCanvas` on its own draft, with the selection and tab state it
 * needs to be interactive — everything the canvas requires that is not the
 * thing under test. Wrap it in {@link EditorWrap}.
 */
export function CanvasHarness({
	schema,
	plugins = testPlugins,
}: {
	schema: Schema;
	plugins?: FieldTypePlugin[];
}) {
	const spec = useSpecDraft(schema, plugins, vi.fn());
	const [selected, setSelected] = useState<string | null>(null);
	const [activeTabIndex, setActiveTabIndex] = useState(0);
	return (
		<ConfirmModalProvider>
			<EditorCanvas
				spec={spec}
				plugins={plugins}
				selectedAccessor={selected}
				onSelect={setSelected}
				onEdit={setSelected}
				labels={CANVAS_LABELS}
				activeTabIndex={activeTabIndex}
				onActiveTabChange={setActiveTabIndex}
			/>
		</ConfirmModalProvider>
	);
}
CanvasHarness.displayName = "CanvasHarness";
