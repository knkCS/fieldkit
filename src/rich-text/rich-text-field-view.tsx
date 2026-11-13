// src/rich-text/rich-text-field-view.tsx
import { Box } from "@chakra-ui/react";
import {
	FIELD_VIEW_NARROW_WIDTH,
	FieldView,
	KnkeditorScope,
	useHostView,
} from "@knkcms/knkeditor-editor";
import { useId, useLayoutEffect, useState } from "react";
import {
	FieldLabelActions,
	useInFieldLabelRow,
} from "../renderer/field-label-row";

/**
 * The view key a rich-text Field's editor and its label row's view share
 * (knkeditor ADR 0011): the Field's accessor, which is its form path in a
 * form — `rows.0.body` in a Group — so unique among the form's Fields, and
 * stable across remounts, which is what lets a host seed and remember each
 * Field's view by it.
 *
 * Read mode hands a nested value its bare accessor (a Group's rows all say
 * `body`) and draws it with no label row of its own; such a value gets a key
 * of its own, so one row's view never changes another's.
 */
export function useRichTextViewKey(accessor: string): string {
	const inRow = useInFieldLabelRow();
	const own = useId();
	return inRow ? accessor : `${accessor}${own}`;
}

/** Whether the row the view sits in is under knkeditor's narrow width. */
function useNarrowRow(): {
	ref: (node: HTMLElement | null) => void;
	narrow: boolean;
} {
	const [node, setNode] = useState<HTMLElement | null>(null);
	const [narrow, setNarrow] = useState(false);
	useLayoutEffect(() => {
		// The label row: the actions slot's parent. Outside one, wherever the
		// view stands.
		const row =
			node?.closest("[data-field-label-actions]")?.parentElement ??
			node?.parentElement;
		if (!row || typeof ResizeObserver === "undefined") return;
		const measure = () => {
			const { width } = row.getBoundingClientRect();
			// A row with no width isn't laid out (hidden, or not yet drawn).
			setNarrow(width > 0 && width < FIELD_VIEW_NARROW_WIDTH);
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		return () => observer.disconnect();
	}, [node]);
	return { ref: setNode, narrow };
}

/**
 * knkeditor's Field view at the right end of a rich-text Field's label row
 * (contenthub ADR 0033): the view presets and "Layers", bound to this
 * Field's editor by `viewKey`, so they change this Field's view and no
 * other's. Read-only, the middle preset reads "Structure" — knkeditor's
 * call, from `readOnly`.
 *
 * Only inside an `EditorHost`. The per-editor view lives in the host's store;
 * outside one the editor keeps its own and draws its own view menu in its
 * toolbar, so a second control here would only repeat it.
 *
 * knkeditor measures the element around the part to pick its narrow form,
 * and here that is the scope, as wide as the part itself; so the row is
 * measured here and the answer passed as `narrow`.
 *
 * The Layers button is knkeditor's `xs` button, 32px tall in knkeditor's
 * scoped system against the segments' 24px, and anker's `xs` (the Reference
 * Field's label-row buttons) is 24px: brought down to the segments' height
 * so a rich-text Field's label row is as tall as any other.
 */
export function RichTextFieldView({
	viewKey,
	label,
	readOnly,
}: {
	viewKey: string;
	label: string;
	readOnly: boolean;
}) {
	const hosted = useHostView(viewKey) !== undefined;
	const { ref, narrow } = useNarrowRow();
	if (!hosted) return null;
	return (
		<FieldLabelActions>
			<Box
				as="span"
				ref={ref}
				display="inline-flex"
				data-rich-text-field-view=""
			>
				<KnkeditorScope
					display="inline-flex"
					alignItems="center"
					css={{
						"& [data-field-view-layers]": { height: "6", minWidth: "6" },
					}}
				>
					<FieldView
						viewKey={viewKey}
						label={label}
						readOnly={readOnly}
						narrow={narrow}
					/>
				</KnkeditorScope>
			</Box>
		</FieldLabelActions>
	);
}
RichTextFieldView.displayName = "RichTextFieldView";
