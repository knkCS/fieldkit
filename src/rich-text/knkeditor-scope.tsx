// src/rich-text/knkeditor-scope.tsx
import {
	Box,
	ChakraProvider,
	createSystem,
	defaultConfig,
} from "@chakra-ui/react";
import type { ReactNode } from "react";

/** The class on the wrapper the scoped system's tokens are set on. */
export const KNKEDITOR_SCOPE_CLASS = "fieldkit-knkeditor";

const scope = `.${KNKEDITOR_SCOPE_CLASS}`;

/**
 * Chakra's default theme, scoped to the wrapper (ADR-0026, amended): knkeditor
 * is styled against it, and under anker's recipes its controls are restyled.
 *
 * Nothing of it may reach the Consumer's page, so it is built from a copy of
 * `defaultConfig` rather than merged over it — `createSystem` deep-merges its
 * configs, so `globalCss: {}` on top of the default would keep the default's
 * `*` and `html` rules. Chakra writes the light and dark values of semantic
 * tokens under the `light` and `dark` conditions, not under `cssVarsRoot`;
 * left as they are (`:root &, .light &`), they would set the default theme's
 * `bg`, `fg`, `border`, … on the page root over anker's. Scoped to the
 * wrapper, they stop there too.
 *
 * Created once, here: a system per render would re-inject its styles.
 */
const knkeditorSystem = createSystem({
	...defaultConfig,
	preflight: false,
	globalCss: {},
	cssVarsRoot: scope,
	conditions: {
		...defaultConfig.conditions,
		light: `${scope} &`,
		dark: `.dark ${scope} &`,
	},
});

/**
 * knkeditor's own Chakra system, around an editor: its controls look as in
 * knkcms core, whose editors these are, and the page around it keeps its
 * theme. The one place in fieldkit that is deliberately not anker.
 */
export function KnkeditorScope({ children }: { children: ReactNode }) {
	return (
		<ChakraProvider value={knkeditorSystem}>
			<Box className={KNKEDITOR_SCOPE_CLASS} colorPalette="gray">
				{children}
			</Box>
		</ChakraProvider>
	);
}
KnkeditorScope.displayName = "KnkeditorScope";
