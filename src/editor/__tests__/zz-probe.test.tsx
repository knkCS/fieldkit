import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Radio, RadioGroup } from "@knkcs/anker/primitives";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";

function Harness() {
	const [value, setValue] = useState("embedded");
	return (
		<ChakraProvider value={defaultSystem}>
			<RadioGroup value={value} onValueChange={(e) => setValue(e.value)}>
				<Radio value="linked">A linked blueprint</Radio>
				<Radio value="embedded">Declared in this field</Radio>
			</RadioGroup>
			<span data-testid="mode">{value}</span>
		</ChakraProvider>
	);
}

it("probe user.click on item text", async () => {
	const user = userEvent.setup();
	render(<Harness />);
	await user.click(screen.getByText("A linked blueprint"));
	console.log("MODE-AFTER-TEXT-CLICK:", screen.getByTestId("mode").textContent);
	console.log(
		"CHECKED:",
		(screen.getByLabelText("A linked blueprint") as HTMLInputElement).checked,
	);
	expect(true).toBe(true);
});

it("probe user.click on hidden input", async () => {
	const user = userEvent.setup();
	render(<Harness />);
	await user.click(screen.getByLabelText("A linked blueprint"));
	console.log(
		"MODE-AFTER-INPUT-CLICK:",
		screen.getByTestId("mode").textContent,
	);
	console.log(
		"CHECKED:",
		(screen.getByLabelText("A linked blueprint") as HTMLInputElement).checked,
	);
	expect(true).toBe(true);
});
