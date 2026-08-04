// src/editor/__tests__/editor-helpers.tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { z } from "zod";
import type { FieldKitAdapters } from "../../renderer/adapters";
import { FieldKitProvider } from "../../renderer/provider";
import type { FieldProps, FieldTypePlugin } from "../../schema/plugin";
import type { Field } from "../../schema/types";

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
