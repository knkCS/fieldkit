// src/editor/panel-sections/settings-section.tsx
import { Text } from "@chakra-ui/react";
import type { PanelSectionProps } from "../field-config-panel";

/**
 * Type-settings section: delegates to the plugin's own settingsComponent,
 * ported from field-modal.tsx:499-510 (defaultSettings fallback, immediate
 * apply — no local buffering, unlike the modal's original Save-on-close).
 */
export function SettingsSection({
	field,
	plugin,
	onFieldChange,
	labels,
	onDrillIn,
	plugins,
}: PanelSectionProps) {
	const SettingsComponent = plugin?.settingsComponent;

	if (!SettingsComponent) {
		return (
			<Text fontSize="sm" color="fg.muted">
				{labels.panelNoSettings}
			</Text>
		);
	}

	const settings = field.settings ?? plugin?.defaultSettings ?? null;

	return (
		<SettingsComponent
			settings={settings}
			field={field}
			onChange={(next) => onFieldChange({ ...field, settings: next })}
			// A settings editor holding a Spec of its own configures it through
			// the panel's incumbent drill-in rather than a nested editor of its
			// own — see SettingsProps.onDrillIn.
			onDrillIn={onDrillIn}
			plugins={plugins}
		/>
	);
}
SettingsSection.displayName = "SettingsSection";
