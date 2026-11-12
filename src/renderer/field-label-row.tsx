// src/renderer/field-label-row.tsx
//
// A Field's label row: the label as a clean left column, the Field's own
// actions at its right end — in the form and in read mode alike (contenthub
// #637). Beside the fields and the form rather than inside either, since both
// draw a label row and the controls that go into it belong to neither.
import { Box } from "@chakra-ui/react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * What a label row offers the value beneath it: where its actions go, and a
 * way to say something after the label's text (a Reference Field's count).
 */
interface FieldLabelRow {
	/** The node at the row's right end, or null until it has mounted. */
	actions: HTMLElement | null;
	/** Sets the text after the label's own, or clears it with null. */
	setSuffix: (suffix: string | null) => void;
}

/**
 * Null where no label row is drawn — and, deliberately, again under a value a
 * container renders for its children: a nested Field's controls are about the
 * nested Field, so they must never land in the row of the Field holding it.
 */
const FieldLabelRowContext = createContext<FieldLabelRow | null>(null);

/**
 * The host half of a label row, for whatever draws one (`ReadField`, a Field
 * that draws its own `FormField`): `slot` goes at the row's right end, `row`
 * into {@link FieldLabelRowProvider} around the value, and `suffix` after the
 * label's text.
 *
 * The slot is a node the controls are *portalled* into rather than a prop they
 * are passed up through, because the state behind a control usually lives in
 * the value below the label — a Reference Tree's fold set is the tree's — and
 * lifting it out to reach a row one component away would be indirection bought
 * with nothing. The value keeps its state; only where its buttons draw moves.
 *
 * The slot is always there, empty or not. It takes no room when empty and
 * sits after a label that already fills the row, so a Field without actions
 * keeps its label exactly where it was.
 */
export function useFieldLabelRowHost(): {
	row: FieldLabelRow;
	slot: ReactNode;
	suffix: string | null;
} {
	const [actions, setActions] = useState<HTMLElement | null>(null);
	const [suffix, setSuffix] = useState<string | null>(null);
	const row = useMemo(() => ({ actions, setSuffix }), [actions]);
	const slot = (
		<Box
			as="span"
			ref={setActions}
			display="flex"
			alignItems="center"
			gap="1"
			flexShrink={0}
			data-field-label-actions=""
		/>
	);
	return { row, slot, suffix };
}

/** Hands a label row to the value beneath it; `row={null}` hides an outer
 * one from a nested value. */
export function FieldLabelRowProvider({
	row,
	children,
}: {
	row: FieldLabelRow | null;
	children: ReactNode;
}) {
	return (
		<FieldLabelRowContext.Provider value={row}>
			{children}
		</FieldLabelRowContext.Provider>
	);
}

/** The label's text with what a value said after it — "Teile · 9". One
 * spelling, for the row a value reports into and for a Field that composes its
 * own `FormField` label alike. */
export function labelWithSuffix(label: string, suffix: string | null): string {
	return suffix ? `${label} · ${suffix}` : label;
}

/**
 * A Field's actions, drawn at the right end of its label row.
 *
 * Takes any nodes — icon buttons today, a search that opens in place later —
 * and keeps them in the component that owns their state. Inside a label row
 * they are portalled into it; outside one (a Consumer assembling a control of
 * its own around an exported piece, such as `ReferenceTree`) they render where
 * they stand, at the right, so a control without a row loses its place but
 * never its actions.
 */
export function FieldLabelActions({ children }: { children: ReactNode }) {
	const row = useContext(FieldLabelRowContext);
	if (row === null) {
		return (
			<Box
				as="span"
				display="flex"
				justifyContent="flex-end"
				alignItems="center"
				gap="1"
			>
				{children}
			</Box>
		);
	}
	// The row is there but its node has not committed yet: the next render,
	// which committing it schedules, draws them.
	if (row.actions === null) return null;
	return createPortal(children, row.actions);
}
FieldLabelActions.displayName = "FieldLabelActions";

/**
 * Says something after the label's text — a Reference Field's count. A string
 * rather than a node, so the label stays one readable name ("Teile · 9") for
 * the group it names. Cleared on unmount, and by passing null; a no-op outside
 * a label row, where there is no label to follow.
 */
export function useFieldLabelSuffix(suffix: string | null): void {
	const setSuffix = useContext(FieldLabelRowContext)?.setSuffix;
	useEffect(() => {
		setSuffix?.(suffix);
	}, [setSuffix, suffix]);
	// Cleared only when the value leaves, so a changed suffix replaces the old
	// one in a single render rather than flashing the bare label in between.
	useEffect(() => {
		if (!setSuffix) return;
		return () => setSuffix(null);
	}, [setSuffix]);
}
