import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { ColorCell } from "../color-cell";

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "color",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("ColorCell", () => {
	it("renders the color value text", () => {
		render(<ColorCell field={makeField()} value="#ff0000" />, { wrapper: Wrapper });
		expect(screen.getByText("#ff0000")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<ColorCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<ColorCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
