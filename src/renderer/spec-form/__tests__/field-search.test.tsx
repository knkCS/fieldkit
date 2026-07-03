import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SpecForm } from "../spec-form";
import { makeField, makeSection, Wrapper } from "./helpers";

const schema = [
	makeField("title", "Title"),
	makeSection("seo", "SEO"),
	makeField("meta", "Meta description"),
];

describe("SpecForm — field search", () => {
	it("renders no search for sectionless schemas", () => {
		render(
			<Wrapper>
				<SpecForm schema={[makeField("a")]} />
			</Wrapper>,
		);
		expect(
			screen.queryByPlaceholderText("Find field…"),
		).not.toBeInTheDocument();
	});

	it("lists matches with their tab label", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		expect(await screen.findByText("Meta description")).toBeInTheDocument();
		// "SEO" is ambiguous against the always-mounted tab trigger of the
		// same name, so scope the match to the search results listbox.
		const listbox = screen.getByRole("listbox");
		expect(within(listbox).getByText("SEO")).toBeInTheDocument();
	});

	it("shows the no-results row", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "zzz" },
		});
		expect(await screen.findByText("No fields found")).toBeInTheDocument();
	});

	it("jumps to a field on another tab: switches, focuses", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.change(screen.getByPlaceholderText("Find field…"), {
			target: { value: "meta" },
		});
		fireEvent.click(await screen.findByText("Meta description"));
		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toBeVisible();
		});
		await waitFor(() => {
			expect(screen.getByTestId("field-meta")).toHaveFocus();
		});
	});

	it("focuses search on '/' when no input is focused", async () => {
		render(
			<Wrapper>
				<SpecForm schema={schema} />
			</Wrapper>,
		);
		fireEvent.keyDown(document.body, { key: "/" });
		await waitFor(() => {
			expect(screen.getByPlaceholderText("Find field…")).toHaveFocus();
		});
	});
});
