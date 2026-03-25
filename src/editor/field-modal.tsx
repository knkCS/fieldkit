// src/editor/field-modal.tsx

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldTypePlugin } from "../schema/plugin";
import type { Field, FieldConfig, FieldValidation } from "../schema/types";

export interface FieldModalProps {
	field: Field | null;
	plugin: FieldTypePlugin | null;
	existingAccessors: string[];
	isOpen: boolean;
	onClose: () => void;
	onSave: (field: Field) => void;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, "_")
		.replace(/[^a-z0-9_]/g, "");
}

const labelStyle: React.CSSProperties = {
	display: "block",
	fontSize: "13px",
	fontWeight: 500,
	marginBottom: "4px",
	color: "var(--chakra-colors-fg-default)",
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "8px",
	border: "1px solid var(--chakra-colors-border)",
	borderRadius: "4px",
	fontSize: "14px",
	boxSizing: "border-box",
};

const sectionHeaderStyle: React.CSSProperties = {
	fontSize: "14px",
	fontWeight: 600,
	margin: "16px 0 12px 0",
	paddingBottom: "6px",
	borderBottom: "1px solid var(--chakra-colors-border)",
	color: "var(--chakra-colors-fg-default)",
};

const fieldGroupStyle: React.CSSProperties = {
	marginBottom: "12px",
};

function FieldModalInner({
	field,
	plugin,
	existingAccessors,
	isOpen,
	onClose,
	onSave,
}: FieldModalProps) {
	const [name, setName] = useState("");
	const [apiAccessor, setApiAccessor] = useState("");
	const [required, setRequired] = useState(false);
	const [instructions, setInstructions] = useState("");
	const [defaultValue, setDefaultValue] = useState("");
	const [hidden, setHidden] = useState(false);
	const [readOnly, setReadOnly] = useState(false);

	const [minLength, setMinLength] = useState("");
	const [maxLength, setMaxLength] = useState("");
	const [pattern, setPattern] = useState("");
	const [patternMessage, setPatternMessage] = useState("");
	const [unique, setUnique] = useState(false);

	// biome-ignore lint/suspicious/noExplicitAny: settings are plugin-specific and vary per field type
	const [settings, setSettings] = useState<any>(null);

	const accessorManuallyEdited = useRef(false);

	// Reset form when field changes or modal opens
	useEffect(() => {
		if (!isOpen) return;

		if (field) {
			setName(field.config.name);
			setApiAccessor(field.config.api_accessor);
			setRequired(field.config.required);
			setInstructions(field.config.instructions);
			setDefaultValue(
				field.config.default_value != null
					? String(field.config.default_value)
					: "",
			);
			setHidden(field.config.hidden ?? false);
			setReadOnly(field.config.read_only ?? false);

			setMinLength(
				field.validation?.min_length != null
					? String(field.validation.min_length)
					: "",
			);
			setMaxLength(
				field.validation?.max_length != null
					? String(field.validation.max_length)
					: "",
			);
			setPattern(field.validation?.pattern ?? "");
			setPatternMessage(field.validation?.pattern_message ?? "");
			setUnique(field.config.unique ?? false);

			setSettings(field.settings ?? plugin?.defaultSettings ?? null);
			accessorManuallyEdited.current = true; // Existing field = accessor already set
		} else {
			setName("");
			setApiAccessor("");
			setRequired(false);
			setInstructions("");
			setDefaultValue("");
			setHidden(false);
			setReadOnly(false);

			setMinLength("");
			setMaxLength("");
			setPattern("");
			setPatternMessage("");
			setUnique(false);

			setSettings(plugin?.defaultSettings ?? null);
			accessorManuallyEdited.current = false;
		}
	}, [field, plugin, isOpen]);

	const handleNameChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const newName = e.target.value;
			setName(newName);
			if (!accessorManuallyEdited.current) {
				setApiAccessor(slugify(newName));
			}
		},
		[],
	);

	const handleAccessorChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			accessorManuallyEdited.current = true;
			setApiAccessor(e.target.value);
		},
		[],
	);

	const accessorError = (() => {
		if (!apiAccessor) return null;
		const existsElsewhere = existingAccessors.some(
			(a) => a === apiAccessor && (!field || a !== field.config.api_accessor),
		);
		if (existsElsewhere) return "This accessor is already in use";
		return null;
	})();

	const canSave =
		name.trim() !== "" && apiAccessor.trim() !== "" && !accessorError;

	const handleSave = useCallback(() => {
		if (!canSave || !plugin) return;

		const config: FieldConfig = {
			name: name.trim(),
			api_accessor: apiAccessor.trim(),
			required,
			instructions: instructions.trim(),
			...(defaultValue ? { default_value: defaultValue } : {}),
			...(unique ? { unique: true } : {}),
			...(hidden ? { hidden: true } : {}),
			...(readOnly ? { read_only: true } : {}),
		};

		const validation: FieldValidation = {};
		if (minLength !== "") validation.min_length = Number(minLength);
		if (maxLength !== "") validation.max_length = Number(maxLength);
		if (pattern) validation.pattern = pattern;
		if (patternMessage) validation.pattern_message = patternMessage;

		const hasValidation = Object.keys(validation).length > 0;

		const result: Field = {
			field_type: plugin.id,
			config,
			validation: hasValidation ? validation : undefined,
			settings: settings ?? null,
			children: field?.children ?? null,
			system: field?.system ?? false,
		};

		onSave(result);
	}, [
		canSave,
		plugin,
		name,
		apiAccessor,
		required,
		instructions,
		defaultValue,
		unique,
		hidden,
		readOnly,
		minLength,
		maxLength,
		pattern,
		patternMessage,
		settings,
		field,
		onSave,
	]);

	if (!isOpen) return null;

	const SettingsComponent = plugin?.settingsComponent;

	return (
		<div
			data-testid="field-modal-overlay"
			role="presentation"
			style={{
				position: "fixed",
				inset: 0,
				background: "var(--chakra-colors-black-alpha-500)",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				zIndex: 1000,
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onClose();
			}}
		>
			<div
				data-testid="field-modal"
				role="dialog"
				aria-label={field ? `Edit ${field.config.name}` : "Add field"}
				style={{
					background: "var(--chakra-colors-bg-surface)",
					borderRadius: "8px",
					width: "560px",
					maxHeight: "85vh",
					overflowY: "auto",
					padding: "24px",
					boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
				}}
			>
				<div
					style={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						marginBottom: "16px",
					}}
				>
					<h3 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
						{field ? "Edit Field" : "Add Field"}
						{plugin && (
							<span
								style={{
									fontWeight: 400,
									color: "var(--chakra-colors-fg-muted)",
									marginLeft: "8px",
								}}
							>
								({plugin.name})
							</span>
						)}
					</h3>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						style={{
							border: "none",
							background: "none",
							cursor: "pointer",
							padding: "4px",
						}}
					>
						<X size={20} />
					</button>
				</div>

				{/* General section */}
				<h4 style={sectionHeaderStyle}>General</h4>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						Name
						<input
							type="text"
							value={name}
							onChange={handleNameChange}
							placeholder="Field name"
							data-testid="field-name-input"
							style={inputStyle}
						/>
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						API Accessor
						<input
							type="text"
							value={apiAccessor}
							onChange={handleAccessorChange}
							placeholder="api_accessor"
							data-testid="field-accessor-input"
							style={{
								...inputStyle,
								borderColor: accessorError
									? "var(--chakra-colors-red-500)"
									: "var(--chakra-colors-border)",
							}}
						/>
					</label>
					{accessorError && (
						<span
							data-testid="accessor-error"
							style={{
								color: "var(--chakra-colors-red-500)",
								fontSize: "12px",
							}}
						>
							{accessorError}
						</span>
					)}
				</div>

				<div style={fieldGroupStyle}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "14px",
						}}
					>
						<input
							type="checkbox"
							checked={required}
							onChange={(e) => setRequired(e.target.checked)}
							data-testid="field-required-input"
						/>
						Required
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						Instructions
						<textarea
							value={instructions}
							onChange={(e) => setInstructions(e.target.value)}
							placeholder="Help text for editors"
							data-testid="field-instructions-input"
							rows={2}
							style={{ ...inputStyle, resize: "vertical" }}
						/>
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						Default Value
						<input
							type="text"
							value={defaultValue}
							onChange={(e) => setDefaultValue(e.target.value)}
							placeholder="Default value"
							data-testid="field-default-input"
							style={inputStyle}
						/>
					</label>
				</div>

				<div style={{ display: "flex", gap: "16px", ...fieldGroupStyle }}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "14px",
						}}
					>
						<input
							type="checkbox"
							checked={hidden}
							onChange={(e) => setHidden(e.target.checked)}
							data-testid="field-hidden-input"
						/>
						Hidden
					</label>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "14px",
						}}
					>
						<input
							type="checkbox"
							checked={readOnly}
							onChange={(e) => setReadOnly(e.target.checked)}
							data-testid="field-readonly-input"
						/>
						Read Only
					</label>
				</div>

				{/* Validation section */}
				<h4 style={sectionHeaderStyle}>Validation</h4>

				<div style={{ display: "flex", gap: "12px", ...fieldGroupStyle }}>
					<label style={{ ...labelStyle, flex: 1 }}>
						Min Length
						<input
							type="number"
							value={minLength}
							onChange={(e) => setMinLength(e.target.value)}
							placeholder="—"
							data-testid="field-min-length-input"
							style={inputStyle}
						/>
					</label>
					<label style={{ ...labelStyle, flex: 1 }}>
						Max Length
						<input
							type="number"
							value={maxLength}
							onChange={(e) => setMaxLength(e.target.value)}
							placeholder="—"
							data-testid="field-max-length-input"
							style={inputStyle}
						/>
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						Pattern (regex)
						<input
							type="text"
							value={pattern}
							onChange={(e) => setPattern(e.target.value)}
							placeholder="^[A-Z]+$"
							data-testid="field-pattern-input"
							style={inputStyle}
						/>
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label style={labelStyle}>
						Pattern Message
						<input
							type="text"
							value={patternMessage}
							onChange={(e) => setPatternMessage(e.target.value)}
							placeholder="Custom validation message"
							data-testid="field-pattern-message-input"
							style={inputStyle}
						/>
					</label>
				</div>

				<div style={fieldGroupStyle}>
					<label
						style={{
							display: "flex",
							alignItems: "center",
							gap: "8px",
							fontSize: "14px",
						}}
					>
						<input
							type="checkbox"
							checked={unique}
							onChange={(e) => setUnique(e.target.checked)}
							data-testid="field-unique-input"
						/>
						Unique
					</label>
				</div>

				{/* Type Settings section */}
				<h4 style={sectionHeaderStyle}>Type Settings</h4>

				{SettingsComponent ? (
					<SettingsComponent settings={settings} onChange={setSettings} />
				) : (
					<p
						style={{
							color: "var(--chakra-colors-fg-subtle)",
							fontSize: "14px",
						}}
					>
						No additional settings
					</p>
				)}

				{/* Footer */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-end",
						gap: "8px",
						marginTop: "24px",
						paddingTop: "16px",
						borderTop: "1px solid var(--chakra-colors-border)",
					}}
				>
					<button
						type="button"
						onClick={onClose}
						style={{
							padding: "8px 16px",
							border: "1px solid var(--chakra-colors-border)",
							borderRadius: "6px",
							background: "var(--chakra-colors-bg-surface)",
							cursor: "pointer",
							fontSize: "14px",
						}}
					>
						Cancel
					</button>
					<button
						type="button"
						data-testid="field-modal-save"
						disabled={!canSave}
						onClick={handleSave}
						style={{
							padding: "8px 16px",
							border: "none",
							borderRadius: "6px",
							background: canSave
								? "var(--chakra-colors-accent)"
								: "var(--chakra-colors-blue-200)",
							color: "var(--chakra-colors-bg-surface)",
							cursor: canSave ? "pointer" : "not-allowed",
							fontSize: "14px",
							fontWeight: 500,
						}}
					>
						{field ? "Update" : "Add"}
					</button>
				</div>
			</div>
		</div>
	);
}

export const FieldModal = FieldModalInner;
(FieldModal as { displayName?: string }).displayName = "FieldModal";
