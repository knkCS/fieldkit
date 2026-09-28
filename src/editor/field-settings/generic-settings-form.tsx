// src/editor/field-settings/generic-settings-form.tsx
import { Box, chakra, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { BaseSelect, Button, IconButton } from "@knkcs/anker/atoms";
import { Plus, X } from "lucide-react";
import { type ChangeEvent, useEffect, useId, useMemo, useState } from "react";
import type { ZodTypeAny } from "zod";
import { isUnset } from "../../schema/validate-settings";
import { deepEqual } from "../deep-equal";
import type { PanelLabels } from "../field-config-panel";
import { SettingLockReason, useSettingLock } from "./setting-lock";
import {
	describeSettingsSchema,
	type ScalarSettingShape,
	type SettingEntry,
	type SettingShape,
	writeSetting,
} from "./settings-schema-model";

/** The labels the generic form renders. A Pick of the panel's own, so a
 * host's merged EditorLabels reach it with no renaming layer. */
export type GenericSettingsLabels = Pick<
	PanelLabels,
	| "settingsAddItem"
	| "settingsRemoveItem"
	| "settingsNotSet"
	| "settingsReadOnly"
>;

export interface GenericSettingsFormProps {
	/** The Field Type's `settingsSchema` — the whole form is read from it. */
	schema: ZodTypeAny;
	settings: unknown;
	onChange: (next: Record<string, unknown>) => void;
	labels: GenericSettingsLabels;
}

/**
 * The Type settings form for a Field Type that brings no `settingsComponent`
 * of its own, generated from its `settingsSchema` (ADR-0018: every type is
 * configurable from its first release).
 *
 * Strings, numbers, booleans, enums, lists of scalars and nested objects get a
 * control; whatever else the schema declares is shown as stored JSON and never
 * written. Every write goes through `writeSetting`, so the form writes only
 * the keys its schema declares and never stores Unset (ADR-0021).
 *
 * Locked Settings (ADR-0011) are honoured the way every fieldkit control
 * honours them: each top-level key asks `useSettingLock` about itself, and a
 * frozen key disables its control — the whole subtree, for an object — with
 * the Consumer's reason beside it.
 *
 * Callers check `hasGenericSettings` first: a schema declaring no key has no
 * form, and the panel says so in its own words.
 */
export function GenericSettingsForm({
	schema,
	settings,
	onChange,
	labels,
}: GenericSettingsFormProps) {
	const entries = useMemo(() => describeSettingsSchema(schema) ?? [], [schema]);
	const current = isRecord(settings) ? settings : {};

	return (
		<Stack gap="3" data-testid="generic-settings-form">
			{entries.map((entry) => (
				<TopLevelSetting
					key={entry.key}
					entry={entry}
					value={current[entry.key]}
					onChange={(value) =>
						onChange(writeSetting(entries, settings, entry.key, value))
					}
					labels={labels}
				/>
			))}
		</Stack>
	);
}
GenericSettingsForm.displayName = "GenericSettingsForm";

/** Whether `schema` declares any key a generic form could lay out. */
export function hasGenericSettings(schema: ZodTypeAny | undefined): boolean {
	if (!schema) return false;
	const entries = describeSettingsSchema(schema);
	return entries !== null && entries.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ControlProps {
	entry: SettingEntry;
	/** Dotted path from the settings root — the control's test id. */
	path: string;
	value: unknown;
	onChange: (value: unknown) => void;
	disabled: boolean;
	labels: GenericSettingsLabels;
}

function TopLevelSetting({
	entry,
	value,
	onChange,
	labels,
}: Omit<ControlProps, "path" | "disabled">) {
	const lock = useSettingLock(entry.key);
	return (
		<Box>
			<SettingControl
				entry={entry}
				path={entry.key}
				value={value}
				onChange={onChange}
				disabled={lock.locked}
				labels={labels}
			/>
			<SettingLockReason lock={lock} />
		</Box>
	);
}

function Caption({ children }: { children: string }) {
	return (
		<Text as="span" fontSize="xs" fontWeight="medium" color="fg.muted">
			{children}
		</Text>
	);
}

/** Helper text sits outside the <label>: a sentence is not a name. */
function Helper({ text }: { text: string | undefined }) {
	if (!text) return null;
	return (
		<Text fontSize="xs" color="fg.muted" mt="1">
			{text}
		</Text>
	);
}

function SettingControl(props: ControlProps) {
	const { entry, path, value, onChange, disabled, labels } = props;
	const shape = entry.shape;
	switch (shape.kind) {
		case "string":
		case "number":
			return (
				<Box>
					<Box as="label" display="block">
						<Caption>{entry.label}</Caption>
						<ScalarInput
							shape={shape}
							value={value}
							onChange={onChange}
							disabled={disabled}
							testId={`generic-setting-${path}`}
						/>
					</Box>
					<Helper text={entry.description} />
				</Box>
			);
		case "boolean":
			return <BooleanControl {...props} shape={shape} />;
		case "enum":
			return <EnumControl {...props} options={shape.options} multi={false} />;
		case "list":
			return shape.item.kind === "enum" ? (
				<EnumControl {...props} options={shape.item.options} multi />
			) : (
				<ScalarListControl {...props} item={shape.item} />
			);
		case "object":
			return <ObjectControl {...props} fields={shape.fields} />;
		case "json":
			return (
				<JsonView entry={entry} path={path} value={value} labels={labels} />
			);
	}
}

/** The value a number box's text stands for: `undefined` for an empty box
 * (Unset), and for text that is not a number yet — a lone "-" mid-typing. */
function parseNumber(
	raw: string,
	shape: Extract<ScalarSettingShape, { kind: "number" }>,
): number | undefined {
	const trimmed = raw.trim();
	if (trimmed === "") return undefined;
	const parsed = Number(trimmed);
	if (!Number.isFinite(parsed)) return undefined;
	return shape.integer ? Math.trunc(parsed) : parsed;
}

function ScalarInput({
	shape,
	value,
	onChange,
	disabled,
	testId,
	ariaLabel,
}: {
	shape: Extract<ScalarSettingShape, { kind: "string" | "number" }>;
	value: unknown;
	onChange: (value: unknown) => void;
	disabled: boolean;
	testId: string;
	ariaLabel?: string;
}) {
	if (shape.kind === "number") {
		return (
			<Input
				size="sm"
				mt="1"
				type="number"
				min={shape.min}
				max={shape.max}
				step={shape.integer ? 1 : "any"}
				value={typeof value === "number" ? value : ""}
				onChange={(e: ChangeEvent<HTMLInputElement>) =>
					onChange(parseNumber(e.target.value, shape))
				}
				disabled={disabled}
				aria-label={ariaLabel}
				data-testid={testId}
			/>
		);
	}
	return (
		<Input
			size="sm"
			mt="1"
			value={typeof value === "string" ? value : ""}
			onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
			disabled={disabled}
			aria-label={ariaLabel}
			data-testid={testId}
		/>
	);
}

/**
 * A checkbox. An unchecked box means the schema's default where it declares
 * one, and "off" otherwise — so the value that matches that meaning is stored
 * as absent rather than as a `false` nobody chose.
 */
function BooleanControl({
	entry,
	path,
	value,
	onChange,
	disabled,
	shape,
}: ControlProps & { shape: Extract<SettingShape, { kind: "boolean" }> }) {
	const fallback = shape.defaultValue ?? false;
	const checked = typeof value === "boolean" ? value : fallback;
	return (
		<Box>
			<Box as="label" display="flex" alignItems="center" gap="2">
				<input
					type="checkbox"
					checked={checked}
					disabled={disabled}
					onChange={(e) =>
						onChange(
							e.target.checked === fallback ? undefined : e.target.checked,
						)
					}
					data-testid={`generic-setting-${path}`}
				/>
				<Text fontSize="sm">{entry.label}</Text>
			</Box>
			<Helper text={entry.description} />
		</Box>
	);
}

interface EnumOption {
	id: string;
	label: string;
}

/** One choice, or several: the same `BaseSelect` the panel's other choice
 * controls use, clearable because every settings key is optional. */
function EnumControl({
	entry,
	path,
	value,
	onChange,
	disabled,
	labels,
	options,
	multi,
}: ControlProps & { options: string[]; multi: boolean }) {
	const inputId = useId();
	const choices: EnumOption[] = options.map((id) => ({ id, label: id }));
	const selected = multi
		? choices.filter((c) => Array.isArray(value) && value.includes(c.id))
		: (choices.find((c) => c.id === value) ?? null);

	return (
		<Box data-testid={`generic-setting-${path}`}>
			<chakra.label
				htmlFor={inputId}
				display="block"
				fontSize="xs"
				fontWeight="medium"
				color="fg.muted"
				mb="1"
			>
				{entry.label}
			</chakra.label>
			<BaseSelect<EnumOption>
				inputId={inputId}
				size="sm"
				options={choices}
				value={selected}
				isMulti={multi}
				isClearable
				placeholder={labels.settingsNotSet}
				disabled={disabled}
				onChange={(next) => {
					if (multi) {
						const picked = Array.isArray(next) ? next : next ? [next] : [];
						onChange(picked.map((option: EnumOption) => option.id));
						return;
					}
					const option = Array.isArray(next) ? next[0] : next;
					onChange(option ? option.id : undefined);
				}}
			/>
			<Helper text={entry.description} />
		</Box>
	);
}

/** The items a row list writes: text parsed to the item's type, and every
 * item left Unset — a blank row not filled in yet — left out. */
function rowsToItems(
	rows: string[],
	item: Extract<ScalarSettingShape, { kind: "string" | "number" }>,
): unknown[] {
	const items: unknown[] = [];
	for (const row of rows) {
		const parsed = item.kind === "number" ? parseNumber(row, item) : row;
		if (!isUnset(parsed)) items.push(parsed);
	}
	return items;
}

function itemsToRows(value: unknown): string[] {
	return Array.isArray(value) ? value.map((v) => String(v)) : [];
}

/**
 * A list of strings or numbers, one row per item.
 *
 * The rows are held locally because a row being added is blank, and a blank
 * item is Unset and never written — so the stored list alone cannot show it.
 * When the stored list changes from outside (a Discard, another control), the
 * rows follow it.
 */
function ScalarListControl({
	entry,
	path,
	value,
	onChange,
	disabled,
	labels,
	item,
}: ControlProps & {
	item: Extract<ScalarSettingShape, { kind: "string" | "number" }>;
}) {
	const [rows, setRows] = useState<string[]>(() => itemsToRows(value));
	const stored = Array.isArray(value) ? value : [];

	useEffect(() => {
		setRows((current) =>
			deepEqual(rowsToItems(current, item), stored)
				? current
				: itemsToRows(stored),
		);
	}, [stored, item]);

	function update(next: string[]) {
		setRows(next);
		onChange(rowsToItems(next, item));
	}

	return (
		<Box data-testid={`generic-setting-${path}`}>
			<Caption>{entry.label}</Caption>
			<Stack gap="1" mt="1">
				{rows.map((row, index) => (
					<Flex
						// biome-ignore lint/suspicious/noArrayIndexKey: rows carry no identity of their own; an index is what the Author edits
						key={index}
						gap="1"
						align="center"
					>
						<Box flex="1">
							<ScalarInput
								shape={item}
								value={item.kind === "number" ? parseNumber(row, item) : row}
								onChange={(v) =>
									update(
										rows.map((r, i) =>
											i === index ? (v === undefined ? "" : String(v)) : r,
										),
									)
								}
								disabled={disabled}
								ariaLabel={`${entry.label} ${index + 1}`}
								testId={`generic-setting-${path}-${index}`}
							/>
						</Box>
						<IconButton
							aria-label={labels.settingsRemoveItem}
							size="xs"
							variant="ghost"
							mt="1"
							disabled={disabled}
							onClick={() => update(rows.filter((_, i) => i !== index))}
							data-testid={`generic-setting-${path}-${index}-remove`}
						>
							<X size={14} />
						</IconButton>
					</Flex>
				))}
			</Stack>
			<Button
				size="xs"
				variant="ghost"
				mt="1"
				disabled={disabled}
				onClick={() => setRows([...rows, ""])}
				data-testid={`generic-setting-${path}-add`}
			>
				<Plus size={14} />
				{labels.settingsAddItem}
			</Button>
			<Helper text={entry.description} />
		</Box>
	);
}

/** A nested object: its keys, laid out the same way, under its own caption.
 * A lock on the object's key covers everything inside it. */
function ObjectControl({
	entry,
	path,
	value,
	onChange,
	disabled,
	labels,
	fields,
}: ControlProps & { fields: SettingEntry[] }) {
	const current = isRecord(value) ? value : {};
	return (
		<Box
			as="fieldset"
			borderWidth="1px"
			borderColor="border.subtle"
			borderRadius="md"
			p="3"
			data-testid={`generic-setting-${path}`}
		>
			<Box as="legend" px="1">
				<Caption>{entry.label}</Caption>
			</Box>
			<Helper text={entry.description} />
			<Stack gap="3" mt="1">
				{fields.map((child) => (
					<SettingControl
						key={child.key}
						entry={child}
						path={`${path}.${child.key}`}
						value={current[child.key]}
						onChange={(v) => onChange({ ...current, [child.key]: v })}
						disabled={disabled}
						labels={labels}
					/>
				))}
			</Stack>
		</Box>
	);
}

/** What a generic form cannot model, shown as stored and never written. */
function JsonView({
	entry,
	path,
	value,
	labels,
}: Pick<ControlProps, "entry" | "path" | "value" | "labels">) {
	return (
		<Box>
			<Caption>{entry.label}</Caption>
			<Box
				as="pre"
				mt="1"
				p="2"
				bg="bg.muted"
				borderRadius="md"
				fontSize="xs"
				fontFamily="mono"
				overflowX="auto"
				whiteSpace="pre-wrap"
				data-testid={`generic-setting-${path}`}
			>
				{isUnset(value)
					? labels.settingsNotSet
					: JSON.stringify(value, null, 2)}
			</Box>
			<Helper text={entry.description} />
			<Text fontSize="xs" color="fg.muted" mt="1">
				{labels.settingsReadOnly}
			</Text>
		</Box>
	);
}
