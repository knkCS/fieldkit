import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia. anker's <Provider> wraps children in a
// next-themes ColorModeProvider that calls window.matchMedia() on mount, so
// any test using <Provider> (e.g. to wire a react-hook-form zodResolver
// harness) crashes without this stub.
if (typeof window !== "undefined" && !window.matchMedia) {
	window.matchMedia = (query: string): MediaQueryList => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	});
}

// jsdom doesn't implement ResizeObserver. anker's SegmentedControl (zag-js
// SegmentGroup) observes its indicator on mount to position it, and several
// other anker primitives (Popover/Menu positioning via @floating-ui/dom) rely
// on it too — any test rendering one crashes with an uncaught
// "ResizeObserver is not a constructor" otherwise. Individual test files
// historically stubbed this locally (still fine — vi.stubGlobal layers over
// this and vi.unstubAllGlobals() falls back to it), but the editor toolbar's
// always-mounted SegmentedControl (0.9.0) means practically every SpecEditor
// render now needs it, so it's provided globally here instead.
if (typeof window !== "undefined" && !window.ResizeObserver) {
	window.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
