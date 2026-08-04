// src/renderer/fields/empty-value.tsx
import { Text } from "@chakra-ui/react";
import { emptyCellValue } from "@knkcs/anker/components";

/**
 * The em dash read mode renders for a value there is nothing to say about.
 *
 * Read mode itself renders this for the four ways a value is empty, before any
 * plugin is consulted. A plugin's own read component renders it for the fifth:
 * a value of the wrong *shape* altogether — form data arrives from a Consumer
 * and is only as well-formed as whatever produced it, so a Group handed a
 * string, or a Reference Field handed one Reference instead of a list, has to
 * read as empty rather than as "[object Object]".
 *
 * One component rather than an em dash per read component, so the convention
 * cannot drift between them — and anker's `emptyCellValue` for the character
 * itself, so read mode and every table cell say nothing the same way.
 */
export function EmptyReadValue() {
	return <Text color="fg.muted">{emptyCellValue}</Text>;
}
EmptyReadValue.displayName = "EmptyReadValue";
