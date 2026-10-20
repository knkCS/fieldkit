// src/editor/field-settings/released-field.tsx
import { createContext, type ReactNode, useContext } from "react";
import type { Field } from "../../schema/types";

/**
 * The Field being configured as the latest Release holds it — `undefined` when
 * the editor was given no Release, or the Release has no such Field.
 *
 * A context rather than a prop on `SettingsProps`, for the reasons the lock
 * and the choice labels are (`setting-lock.tsx`): the panel knows the
 * Release, a settings component is mounted by the panel, and the contract
 * every Consumer's settings component compiles against stays as it is. The
 * panel publishes the whole released Field and stays ignorant of what any
 * type does with it (ADR-0007); the choice types' editor reads its Options'
 * Keys (ADR-0028).
 *
 * Outside a provider nothing is released, so every settings editor still
 * renders where the config panel is not.
 */
const ReleasedFieldContext = createContext<Field | undefined>(undefined);

export function ReleasedFieldProvider({
	field,
	children,
}: {
	field: Field | undefined;
	children: ReactNode;
}) {
	return (
		<ReleasedFieldContext.Provider value={field}>
			{children}
		</ReleasedFieldContext.Provider>
	);
}
ReleasedFieldProvider.displayName = "ReleasedFieldProvider";

export function useReleasedField(): Field | undefined {
	return useContext(ReleasedFieldContext);
}
