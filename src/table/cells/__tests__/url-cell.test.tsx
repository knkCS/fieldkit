import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { Field } from "../../../schema/types";
import { UrlCell } from "../url-cell";

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const makeField = (overrides?: { config?: Partial<Field["config"]> }): Field => ({
	field_type: "url",
	config: { name: "Test", api_accessor: "test", required: false, instructions: "", ...overrides?.config },
	settings: null,
	system: false,
});

describe("UrlCell", () => {
	it("renders a link", () => {
		render(<UrlCell field={makeField()} value="https://example.com" />, { wrapper: Wrapper });
		const link = screen.getByRole("link");
		expect(link.getAttribute("href")).toBe("https://example.com");
		expect(link.getAttribute("target")).toBe("_blank");
	});

	it("renders empty cell value for null", () => {
		render(<UrlCell field={makeField()} value={null} />);
		expect(screen.getByText("—")).toBeDefined();
	});

	it("renders empty cell value for empty string", () => {
		render(<UrlCell field={makeField()} value="" />);
		expect(screen.getByText("—")).toBeDefined();
	});
});
