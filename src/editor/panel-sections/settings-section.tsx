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
		/>
	);
}
SettingsSection.displayName = "SettingsSection";
