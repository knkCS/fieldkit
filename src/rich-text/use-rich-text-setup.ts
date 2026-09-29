// src/rich-text/use-rich-text-setup.ts
import {
	type EditorSettings,
	needsNewerVocabulary,
	type ResolvedTextType,
} from "@knkcms/knkeditor-vocabulary";
import { useEffect, useRef, useState } from "react";
import type { FieldKitAdapters } from "../renderer/adapters";
import { useFieldKit } from "../renderer/provider";
import type { RichTextSettings } from "../schema/field-types/rich-text";
import type { Field } from "../schema/types";
import { TEXT_TYPE_KIND } from "../schema/vocabulary-version";

/**
 * What a knkeditor editor needs before it mounts. knkeditor takes its Text
 * Type and Editor Settings when it mounts and loads its content once, so the
 * field waits for both rather than mounting and reconfiguring.
 */
export type RichTextSetup =
	| { status: "loading" }
	| {
			status: "ready";
			/** Absent for a Field that pins none: the editor then runs under the
			 * whole vocabulary, as Go validates it (`ValidateValue`). */
			textType?: ResolvedTextType;
			/** Absent without an `editorSettings` adapter, or when fetching them
			 * failed: knkeditor's defaults then. */
			editorSettings?: EditorSettings;
	  }
	| {
			status: "unavailable";
			/** Why there is no editor, said to the person filling in the form. */
			reason: string;
	  };

type TextTypeAdapter = NonNullable<FieldKitAdapters["textType"]>;
type EditorSettingsAdapter = NonNullable<FieldKitAdapters["editorSettings"]>;

// One fetch per adapter object and Release id, however many Fields — or
// remounts of one — ask. Keyed weakly, so a Consumer's replaced adapter takes
// its cache with it.
const textTypeFetches = new WeakMap<
	TextTypeAdapter,
	Map<string, Promise<unknown>>
>();
const editorSettingsFetches = new WeakMap<
	EditorSettingsAdapter,
	Promise<unknown>
>();

function fetchTextType(adapter: TextTypeAdapter, release: string) {
	let byRelease = textTypeFetches.get(adapter);
	if (!byRelease) {
		byRelease = new Map();
		textTypeFetches.set(adapter, byRelease);
	}
	let fetch = byRelease.get(release);
	if (!fetch) {
		fetch = adapter.get(release);
		// A failed fetch is not remembered: the next mount asks again.
		fetch.catch(() => byRelease.delete(release));
		byRelease.set(release, fetch);
	}
	return fetch;
}

function fetchEditorSettings(adapter: EditorSettingsAdapter) {
	let fetch = editorSettingsFetches.get(adapter);
	if (!fetch) {
		fetch = adapter.get();
		fetch.catch(() => editorSettingsFetches.delete(adapter));
		editorSettingsFetches.set(adapter, fetch);
	}
	return fetch;
}

/**
 * Why a Field whose Text Type needs a newer vocabulary than the bundled one
 * (`needsNewerVocabulary`) has no editor: the page was loaded before a
 * deploy. Nothing is wrong with the document, so nothing goes to `onError`.
 *
 * fieldkit says so itself rather than mounting knkeditor, which would show
 * its own notice: knkeditor's stale editor builds an editor it never
 * attaches, and tiptap destroys that one if React's effects run more than a
 * millisecond after render — a crash in `useKnkEditor`, reliably so in jsdom.
 */
export const NEEDS_NEWER_EDITOR =
	"This field needs a newer editor: its Text Type was set up for a newer version than this page has loaded, so it is shown read-only. Reload the page to edit it.";

function asError(cause: unknown): Error {
	return cause instanceof Error ? cause : new Error(String(cause));
}

/**
 * The Text Type and Editor Settings a knkeditor-backed rich_text Field opens
 * with (ADR-0026).
 *
 * - **Text Type:** the Resolved Spec's part for the Field's `text_type` Pin,
 *   from the provider's `parts`; for a Pin they do not hold, the `textType`
 *   adapter's `get`. With neither, the Field has no editor — editing under
 *   the wrong Text Type would write documents Go refuses.
 * - **Editor Settings:** the `editorSettings` adapter, when there is one.
 *   Failing to fetch them is reported and the editor runs with knkeditor's
 *   defaults: they change how the editor helps, not what a document may hold.
 */
export function useRichTextSetup(
	field: Field<RichTextSettings>,
): RichTextSetup {
	const { adapters, parts, onError } = useFieldKit();
	const accessor = field.config.api_accessor;
	const release = field.settings?.text_type || undefined;
	const part = release ? parts[TEXT_TYPE_KIND]?.[release] : undefined;
	const textTypeAdapter = adapters.textType;
	const editorSettingsAdapter = adapters.editorSettings;

	// The adapters and `onError` are read at fetch time rather than depended
	// on: a Consumer rebuilding its adapters object each render must not send
	// a mounted editor back to loading.
	const latest = useRef({ textTypeAdapter, editorSettingsAdapter, onError });
	latest.current = { textTypeAdapter, editorSettingsAdapter, onError };

	const [setup, setSetup] = useState<RichTextSetup>({ status: "loading" });

	useEffect(() => {
		let live = true;
		const { textTypeAdapter, editorSettingsAdapter, onError } = latest.current;
		const report = (cause: unknown) => onError?.(asError(cause), accessor);

		const textType: Promise<unknown> =
			!release || part !== undefined
				? Promise.resolve(part)
				: textTypeAdapter
					? fetchTextType(textTypeAdapter, release)
					: Promise.reject(
							new Error(
								`Text Type Release "${release}" is not in the Resolved Spec's parts, and there is no textType adapter to fetch it`,
							),
						);
		const editorSettings: Promise<unknown> = editorSettingsAdapter
			? fetchEditorSettings(editorSettingsAdapter).catch((cause) => {
					report(cause);
					return undefined;
				})
			: Promise.resolve(undefined);

		setSetup({ status: "loading" });
		Promise.all([textType, editorSettings]).then(
			([textType, editorSettings]) => {
				if (!live) return;
				if (
					textType != null &&
					needsNewerVocabulary(textType as ResolvedTextType)
				) {
					setSetup({ status: "unavailable", reason: NEEDS_NEWER_EDITOR });
					return;
				}
				setSetup({
					status: "ready",
					textType: (textType ?? undefined) as ResolvedTextType | undefined,
					editorSettings: (editorSettings ?? undefined) as
						| EditorSettings
						| undefined,
				});
			},
			(cause) => {
				if (!live) return;
				report(cause);
				setSetup({
					status: "unavailable",
					reason: `Rich text can't be edited: its Text Type (${release}) could not be loaded.`,
				});
			},
		);
		return () => {
			live = false;
		};
	}, [accessor, release, part]);

	return setup;
}
