import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Field } from "../../../schema/types";
import { SavingConsumer } from "./consumer-harness";

// spec-form.mdx's "A Consumer-owned Save across unmounting tabs" (#335),
// end to end: the recipe's Save, its re-baseline on the snapshot taken when
// Save started, and a remount.

const field = (
	field_type: string,
	api_accessor: string,
	name: string,
): Field => ({
	field_type,
	config: { name, api_accessor, required: false, instructions: "" },
	system: false,
});

const schema: Field[] = [
	field("text", "title", "Title"),
	field("section", "details", "Details"),
	field("text", "subtitle", "Subtitle"),
];
const stored = { title: "Book", subtitle: "A story" };

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

async function click(name: string) {
	await act(async () => {
		fireEvent.click(screen.getByRole("button", { name }));
	});
}

// Awaited: after a submit, React Hook Form re-validates a change through
// the (async) resolver before it publishes the new dirty state.
async function type(label: string, value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText(label), { target: { value } });
	});
}

const dirty = () => screen.getByTestId("dirty").textContent;
const tabDot = (index: number) => screen.queryByTestId(`tab-dirty-${index}`);

describe("a Consumer-owned Save, re-baselined on the snapshot", () => {
	it("keeps an edit made while the save is in flight dirty", async () => {
		const pending = deferred();
		const onSave = vi.fn(() => pending.promise);
		render(<SavingConsumer schema={schema} stored={stored} onSave={onSave} />);

		await type("Title", "Book, revised");
		await click("Save");
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(onSave.mock.calls[0][0]).toMatchObject({ title: "Book, revised" });

		// The save is in flight; the author keeps typing.
		await type("Subtitle", "A longer story");
		await act(async () => {
			pending.resolve();
		});

		expect(screen.getByLabelText("Subtitle")).toHaveValue("A longer story");
		expect(dirty()).toBe("true");
		// Dirty where the edit is, and only there: the saved Title is clean.
		expect(tabDot(1)).toBeInTheDocument();
		expect(tabDot(0)).not.toBeInTheDocument();

		// Undoing that edit leaves the form clean: the baseline is what was
		// sent, not what the form held when the save came back.
		await type("Subtitle", "A story");
		expect(dirty()).toBe("false");
		expect(tabDot(1)).not.toBeInTheDocument();
	});

	it("is clean after a save with no further edits, and after a remount", async () => {
		const onSave = vi.fn(async () => {});
		render(<SavingConsumer schema={schema} stored={stored} onSave={onSave} />);

		await type("Title", "Book, revised");
		await click("Save");
		expect(onSave).toHaveBeenCalledTimes(1);
		expect(dirty()).toBe("false");
		expect(tabDot(0)).not.toBeInTheDocument();

		await click("Toggle");
		await click("Toggle");
		expect(screen.getByLabelText("Title")).toHaveValue("Book, revised");
		expect(dirty()).toBe("false");
		expect(tabDot(0)).not.toBeInTheDocument();
	});

	it("is clean after a save made while SpecForm is unmounted", async () => {
		const onSave = vi.fn(async () => {});
		render(<SavingConsumer schema={schema} stored={stored} onSave={onSave} />);

		await type("Title", "Book, revised");
		await click("Toggle");
		expect(dirty()).toBe("true");
		await click("Save");
		expect(onSave.mock.calls[0][0]).toMatchObject({ title: "Book, revised" });
		expect(dirty()).toBe("false");

		await click("Toggle");
		expect(screen.getByLabelText("Title")).toHaveValue("Book, revised");
		expect(dirty()).toBe("false");
		expect(tabDot(0)).not.toBeInTheDocument();
	});

	it("stays clean across a remount when a field was cleared before saving", async () => {
		const onSave = vi.fn(async () => {});
		render(<SavingConsumer schema={schema} stored={stored} onSave={onSave} />);

		await type("Subtitle", "");
		await click("Save");
		// What was sent is canonical: the cleared Field is Unset, stored as
		// absent (ADR-0021). The baseline is the form's own value, "".
		expect(onSave.mock.calls[0][0]).not.toHaveProperty("subtitle");
		expect(dirty()).toBe("false");

		await click("Toggle");
		await click("Toggle");
		expect(screen.getByLabelText("Subtitle")).toHaveValue("");
		expect(dirty()).toBe("false");
		expect(tabDot(1)).not.toBeInTheDocument();
	});

	it("calls onInvalid, not the save, when validation fails", async () => {
		// The jump to the errored section is SpecForm's (spec-form-remount
		// tests); the Consumer's half is to show its Content tab.
		const onSave = vi.fn(async () => {});
		const onInvalid = vi.fn();
		const strict: Field[] = [
			{ ...field("text", "title", "Title"), validation: { max_length: 4 } },
		];
		render(
			<SavingConsumer
				schema={strict}
				stored={{ title: "Book" }}
				onSave={onSave}
				onInvalid={onInvalid}
			/>,
		);

		await type("Title", "Too long");
		await click("Save");
		expect(onInvalid).toHaveBeenCalledTimes(1);
		expect(onSave).not.toHaveBeenCalled();
		expect(dirty()).toBe("true");
	});
});
