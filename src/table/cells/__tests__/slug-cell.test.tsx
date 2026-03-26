import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { SlugCell } from "../slug-cell";

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const makeField = (overrides?: {
	config?: Partial<Field["config"]>;
}): Field => ({
	field_type: "slug",
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

describe("SlugCell", () => {
	it("renders slug text", () => {
		render(<SlugCell field={makeField()} value="my-page-slug" />, {
			wrapper: Wrapper,
		});
		expect(screen.getByText("my-page-slug")).toBeDefined();
	});

	it("renders empty cell value for null", () => {
		render(<SlugCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
