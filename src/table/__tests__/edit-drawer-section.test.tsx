// src/table/__tests__/edit-drawer-section.test.tsx

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	makeField,
	makeSection,
} from "../../renderer/spec-form/__tests__/helpers";
import { builtInFieldTypes } from "../../schema/field-types";
import { EditDrawer } from "../edit-drawer";

// EditDrawer keeps one form for its whole life and reset()s it per row, while
// its content unmounts on close. SpecForm remembers the open section per form
// (#334), so a closed-and-reopened drawer must not carry one row's section
// into the next (#339).

function Wrapper({ children }: { children: ReactNode }) {
	return <ChakraProvider value={defaultSystem}>{children}</ChakraProvider>;
}

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

function selected(name: string) {
	return screen
		.getByRole("tab", { name: new RegExp(name) })
		.getAttribute("aria-selected");
}

describe("EditDrawer — the open section across rows", () => {
	it("opens the next row on the first section", async () => {
		const props = {
			schema,
			plugins: builtInFieldTypes,
			onClose: vi.fn(),
			onSave: vi.fn(),
		};
		const { rerender } = render(
			<EditDrawer {...props} isOpen initialValues={{ title: "A" }} />,
			{ wrapper: Wrapper },
		);

		await act(async () => {
			fireEvent.click(screen.getByRole("tab", { name: /SEO/ }));
		});
		expect(selected("SEO")).toBe("true");

		rerender(
			<EditDrawer {...props} isOpen={false} initialValues={{ title: "A" }} />,
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("tab", { name: /SEO/ }),
			).not.toBeInTheDocument(),
		);

		await act(async () => {
			rerender(<EditDrawer {...props} isOpen initialValues={{ title: "B" }} />);
		});
		expect(selected("General")).toBe("true");
	});
});
