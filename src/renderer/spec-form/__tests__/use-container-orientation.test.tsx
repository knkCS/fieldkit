import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useContainerOrientation } from "../use-container-orientation";

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void;
let lastCallback: ResizeCallback | null = null;
let observeCalls = 0;

class MockResizeObserver {
	constructor(cb: ResizeCallback) {
		lastCallback = cb;
	}
	observe() {
		observeCalls++;
	}
	disconnect() {}
}

function Probe({ configured }: { configured: "horizontal" | "vertical" }) {
	const { orientation, containerRef } = useContainerOrientation(configured);
	return (
		<div ref={containerRef} data-testid="probe">
			{orientation}
		</div>
	);
}

/** Mounts the ref-bearing element only after a later render, reproducing the
 * loading-skeleton → content transition where the container isn't present
 * on the first render. */
function DeferredMountProbe({
	configured,
}: {
	configured: "horizontal" | "vertical";
}) {
	const [show, setShow] = useState(false);
	const { orientation, containerRef } = useContainerOrientation(configured);
	return (
		<div>
			<button type="button" onClick={() => setShow(true)}>
				mount
			</button>
			{show ? (
				<div ref={containerRef} data-testid="probe">
					{orientation}
				</div>
			) : null}
		</div>
	);
}

afterEach(() => {
	vi.unstubAllGlobals();
	lastCallback = null;
	observeCalls = 0;
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
		vi.stubGlobal("ResizeObserver", undefined);
		render(<Probe configured="vertical" />);
		expect(screen.getByTestId("probe").textContent).toBe("vertical");
	});

	it("attaches the observer when the element mounts after the first render", () => {
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		render(<DeferredMountProbe configured="vertical" />);

		// Nothing mounted yet: no observer attached.
		expect(observeCalls).toBe(0);

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "mount" }));
		});

		// The element mounted after the initial render; the observer must
		// still attach (this is the exact scenario the ref-identity bug broke).
		expect(observeCalls).toBe(1);

		act(() => lastCallback?.([{ contentRect: { width: 400 } }]));
		expect(screen.getByTestId("probe").textContent).toBe("horizontal");
	});
});
