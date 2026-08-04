// @knkcs/fieldkit/editor — Specification editor

// Locked settings (ADR-0011). Exported because the ADR's requirement is that
// EVERY settings editor honours the list, "including the ones Consumers write
// themselves" — a Consumer's own `settingsComponent` needs the same hook
// fieldkit's own controls use, or honouring the lock is a thing only fieldkit
// can do.
export type {
	SettingLock,
	SettingLockProviderProps,
} from "./field-settings/setting-lock";
export {
	SettingLockProvider,
	SettingLockReason,
	useSettingLock,
} from "./field-settings/setting-lock";
export type { EditorLabels, SpecEditorProps } from "./spec-editor";
export { DEFAULT_EDITOR_LABELS, SpecEditor } from "./spec-editor";
export type { TypePickerLabels, TypePickerProps } from "./type-picker";
export { DEFAULT_TYPE_PICKER_LABELS, TypePicker } from "./type-picker";
export type { SpecDraft } from "./use-spec-draft";
export { useSpecDraft } from "./use-spec-draft";
