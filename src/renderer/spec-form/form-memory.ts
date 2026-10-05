import type { Control, FieldValues } from "react-hook-form";

// What SpecForm remembers about a form across its own unmounts. A Consumer
// owns the form and may unmount SpecForm while keeping it (anker ADR 0004:
// only the active nav-link tab is mounted), so anything SpecForm must not
// forget on a remount lives here, keyed by the form, rather than in a ref
// that starts afresh on every mount.
//
// Internal, never exported from the package: it is SpecForm's memory, not
// the Consumer's API. One entry per form and record; a new kind of memory is a new
// field on FormMemory.
export interface FormMemory {
	/** The highest `submitCount` whose error jump has been handled. */
	handledSubmit: number;
	/**
	 * The open section's key (#334): its Accessor, or "" for the implicit
	 * sectionless leading tab — never an Accessor, so the two cannot
	 * collide. Absent until the form first shows a tab. Kept by Accessor,
	 * not index, so a reordered Spec reopens the same section.
	 */
	activeSection?: string;
}

/** The record a Consumer says is open (SpecForm's `recordKey`, #339). */
export type RecordKey = string | number;

// Keyed by `control`: React Hook Form creates it once per `useForm()` and
// keeps it for the form's life, and a WeakMap lets a dropped form's memory
// go with it. One slot per form, holding the memory of the record last
// open in it: the memory belongs to a record, not to a form (#339), and a
// Consumer that reuses one form across records (EditDrawer, one form for
// every row) says which record is open. Another key starts afresh, and
// returning to an earlier key does not restore it — nothing asks for that.
const memories = new WeakMap<
	Control<FieldValues>,
	{ recordKey: RecordKey | undefined; memory: FormMemory }
>();

/**
 * This form's memory for the open record, created on first use and again
 * whenever `recordKey` changes. Mutable: write to it.
 */
export function formMemory<T extends FieldValues>(
	control: Control<T>,
	recordKey?: RecordKey,
): FormMemory {
	const key = control as unknown as Control<FieldValues>;
	let slot = memories.get(key);
	if (!slot || slot.recordKey !== recordKey) {
		slot = { recordKey, memory: { handledSubmit: 0 } };
		memories.set(key, slot);
	}
	return slot.memory;
}
