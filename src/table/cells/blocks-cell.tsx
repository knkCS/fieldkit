import type { CellProps } from "../../schema/plugin";
import type { BlocksSettings } from "../../schema/field-types/blocks";

export function BlocksCell({ field, value }: CellProps<BlocksSettings>) {
  if (!Array.isArray(value)) return <span>—</span>;

  const count = value.length;
  const allowedBlocks = field.settings?.allowed_blocks ?? [];

  const typeNames = value
    .map((block) => {
      const blockType = (block as Record<string, unknown>)?._type;
      if (!blockType) return "unknown";
      const def = allowedBlocks.find((b) => b.type === blockType);
      return def?.name ?? String(blockType);
    })
    .slice(0, 3);

  const summary = typeNames.join(", ");
  const suffix = count > 3 ? `, +${count - 3} more` : "";

  return (
    <span>
      {count} {count === 1 ? "block" : "blocks"}
      {count > 0 && ` (${summary}${suffix})`}
    </span>
  );
}
BlocksCell.displayName = "BlocksCell";
