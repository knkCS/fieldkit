// src/editor/error-paths.ts
import type { SpecFieldError } from "../schema/validate-spec";

/**
 * The top-level Field an error belongs to: the first segment of its `path`,
 * unescaped.
 *
 * Not `error.accessor`, which is the Accessor of the Field the error is AT —
 * a Group's child, a Block Type's Field, an Attribute in a Reference Spec. An
 * Accessor is unique only among its siblings (ADR-0022 made `validateSpec()`
 * walk every Spec a Field holds), so matching a canvas shell by it would pin
 * an Attribute named `note` on an unrelated top-level `note`. The path names
 * the shell the Author has to open.
 */
export function topLevelAccessor(error: SpecFieldError): string {
	const first = error.path.split("/")[1] ?? "";
	return first.replace(/~1/g, "/").replace(/~0/g, "~");
}

/** Whether `path` is `at` itself or lies inside it. */
export function pathWithin(path: string, at: string): boolean {
	return path === at || path.startsWith(`${at}/`);
}
