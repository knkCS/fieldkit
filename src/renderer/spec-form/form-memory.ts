import type { Control, FieldValues } from "react-hook-form";

// What SpecForm remembers about a form across its own unmounts. A Consumer
// owns the form and may unmount SpecForm while keeping it (anker ADR 0004:
// only the active nav-link tab is mounted), so anything SpecForm must not
// forget on a remount lives here, keyed by the form, rather than in a ref
// that starts afresh on every mount.
//
// Internal, never exported from the package: it is SpecForm's memory, not
// the Consumer's API. One entry per form; a new kind of memory is a new
// field on FormMemory.
export interface FormMemory {
	/** The highest `submitCount` whose error jump has been handled. */
	handledSubmit: number;
}

// Keyed by `control`: React Hook Form creates it once per `useForm()` and
// keeps it for the form's life, and a WeakMap lets a dropped form's memory
// go with it.
const memories = new WeakMap<Control<FieldValues>, FormMemory>();

/** This form's memory, created on first use. Mutable: write to it. */
export function formMemory<T extends FieldValues>(
	control: Control<T>,
): FormMemory {
	const key = control as unknown as Control<FieldValues>;
	let memory = memories.get(key);
	if (!memory) {
		memory = { handledSubmit: 0 };
		memories.set(key, memory);
	}
	return memory;
}
