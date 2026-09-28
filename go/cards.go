package fieldkit

// The Field Types of the two Markers that partition a Spec's layout.
const (
	sectionFieldType = "section"
	cardFieldType    = "card"
)

// cardLayout is the card-marker rule, as TS's validateSpec states it
// (checkCardLayout): a Spec's top level is split into tabs at each section
// marker, and once a tab holds a card marker every Field in it lives in a
// card — a Field before the tab's first card is CodeLooseFieldInCardedTab, at
// that Field. Top level only: cards inside a container are a non-goal.
//
// knkCS/commons' fieldspec.EnsureSystemFields honours the same rule from the
// other side: it merges a missing system Field in after a leading card rather
// than before it, so a merge never manufactures the state this reports.
func cardLayout(spec Spec) []Error {
	var errs []Error
	// loose holds the Fields of the current tab seen before its first card;
	// carded is whether the tab has reached one.
	var loose []Field
	carded := false
	flush := func() {
		if carded {
			for _, f := range loose {
				errs = append(errs, Error{
					Path: joinPath("", f.Config.APIAccessor),
					Code: CodeLooseFieldInCardedTab,
				})
			}
		}
		loose, carded = nil, false
	}
	for _, f := range spec {
		switch {
		case f.FieldType == sectionFieldType:
			flush()
		case f.FieldType == cardFieldType:
			carded = true
		case !carded:
			loose = append(loose, f)
		}
	}
	flush()
	return errs
}
