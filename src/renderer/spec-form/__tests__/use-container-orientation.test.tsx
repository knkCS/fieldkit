import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContainerOrientation } from "../use-container-orientation";

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void;
let lastCallback: ResizeCallback | null = null;

class MockResizeObserver {
	constructor(cb: ResizeCallback) {
		lastCallback = cb;
	}
	observe() {}
	disconnect() {}
}

function Probe({ configured }: { configured: "horizontal" | "vertical" }) {
	const ref = useRef<HTMLDivElement>(null);
	const orientation = useContainerOrientation(ref, configured);
	return (
		<div ref={ref} data-testid="probe">
			{orientation}
		</div>
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	lastCallback = null;
});

describe("useContainerOrientation", () => {
	it("returns configured horizontal as-is", () => {
		render(<Probe configured="horizontal" />);
		expect(screen.getByTestId("probe").textContent).toBe("horizontal");
	});

	it("returns vertical when the container is wide", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		render(<Probe configured="vertical" />);
		act(() => lastCallback?.([{ contentRect: { width: 800 } }]));
		expect(screen.getByTestId("probe").textContent).toBe("vertical");
	});

	it("degrades vertical to horizontal below 560px", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		render(<Probe configured="vertical" />);
		act(() => lastCallback?.([{ contentRect: { width: 400 } }]));
		expect(screen.getByTestId("probe").textContent).toBe("horizontal");
	});

	it("falls back to configured when ResizeObserver is unavailable", () => {
		render(<Probe configured="vertical" />);
		expect(screen.getByTestId("probe").textContent).toBe("vertical");
	});
});
