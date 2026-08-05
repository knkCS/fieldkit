// src/renderer/spec-form/__tests__/render-timing.ts
/**
 * The one piece of render timing this suite has to be exact about: the gap
 * between a render being on screen and that render's passive effects having
 * run.
 *
 * Kept apart from `helpers.tsx`, which is Spec fixtures and nothing else.
 */
import { waitFor } from "@testing-library/react";

/**
 * Run `press` at the FIRST moment anything outside React can see `selector` on
 * screen — the microtask checkpoint after the render that put it there.
 *
 * That instant is the point (#82). For a render reached from a timer rather
 * than from a discrete user event, React schedules the passive effects onto a
 * **later task** than the one that mutated the DOM. So at this checkpoint a
 * listener registered in a `useEffect` is not attached yet, while one
 * registered in a layout effect is. A test that instead awaits the node with
 * `findBy*` lands after that flush most of the time and before it under load,
 * which is why the two Escape tests were flaky rather than red.
 *
 * The wait is a `waitFor` rather than a bare promise on purpose: React Testing
 * Library turns the act environment off for its duration, so the debounced
 * state update under test is not reported as an update outside `act()`.
 */
export async function asSoonAsRendered(
	selector: string,
	press: () => void,
): Promise<void> {
	// A MutationObserver only ever reports a CHANGE, so a selector that already
	// matches would never fire and the wait below would time out saying the
	// opposite of what happened. Fail on the spot, with the real reason.
	if (document.querySelector(selector)) {
		throw new Error(`${selector} was already on screen; nothing to catch`);
	}
	let fired = false;
	let thrown: unknown;
	const observer = new MutationObserver(() => {
		if (!document.querySelector(selector)) return;
		observer.disconnect();
		fired = true;
		// Carried out rather than left to the observer, which swallows throws:
		// an assertion that failed inside `press` would otherwise surface as
		// "never rendered", naming the wrong problem.
		try {
			press();
		} catch (error) {
			thrown = error;
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	try {
		await waitFor(() => {
			if (!fired) throw new Error(`${selector} never rendered`);
		});
	} finally {
		observer.disconnect();
	}
	if (thrown) throw thrown;
}
