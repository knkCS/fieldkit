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
