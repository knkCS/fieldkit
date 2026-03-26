import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { CodeCell } from "../code-cell";

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "code",
	config: {
		name: "Test",
		api_accessor: "test",
		required: false,
		instructions: "",
		...overrides?.config,
	},
	settings: null,
	system: false,
});

describe("CodeCell", () => {
	it("renders code text", () => {
		render(<CodeCell field={makeField()} value="const x = 1;" />, {
			wrapper: Wrapper,
		});
		expect(screen.getByText("const x = 1;")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<CodeCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("truncates long code", () => {
		const long = "x".repeat(100);
		render(<CodeCell field={makeField()} value={long} />, { wrapper: Wrapper });
		expect(screen.queryByText(long)).toBeNull();
	});
});
