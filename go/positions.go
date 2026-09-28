package fieldkit

import "slices"

// The Positions a Field may sit in (ADR-0022): where in a Spec it is, which
// decides the Field Types it may be. A type's Catalogue entry lists its
// Positions, and ValidateSpec reports a Field anywhere else as CodePosition.
// The list only grows.
const (
	// PositionRoot is the top level of a Spec. A Group's or a Fieldset's
	// children sit in their container's Position, so a Group at the root
	// holds root Fields.
	PositionRoot = "root"
	// PositionRow is a Virtual Table's Row Spec (ADR-0017).
	PositionRow = "row"
	// PositionReferenceSpec is a Reference Field's Reference Spec.
	PositionReferenceSpec = "reference_spec"
	// PositionBlockType is the Fields of a Blocks Field's Block Type.
	PositionBlockType = "block_type"
)

// allowsPosition reports whether the Catalogue lets a Field of this type sit
// in this Position. A type the Catalogue does not list sits nowhere — but
// ValidateSpec reports it as CodeUnknownFieldType instead, never twice.
func (c *Catalogue) allowsPosition(fieldType, position string) bool {
	t, ok := c.Type(fieldType)
	return ok && slices.Contains(t.Positions, position)
}
