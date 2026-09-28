package publishing

import (
	"strconv"

	fieldkit "github.com/knkcs/fieldkit/go"
)

// referenceFilter is reference_filter: the Content ids a Reference leaves
// out. Its only Position is reference_spec, which the Catalogue records and
// ValidateSpec enforces. It has no settings of its own, no text and no edges,
// and compares and merges as a whole value.
var referenceFilter = fieldkit.TypeCode{ //nolint:gochecknoglobals
	Value: referenceFilterValue,
}

// referenceFilterValue is the Go reading of its toZodType,
// z.array(z.string().min(1)): a list of ids, each a string that is not "".
// A required Field's empty list is Unset, which ValidateValue reports as
// required before this runs.
func referenceFilterValue(_ fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.Error {
	items, ok := value.([]any)
	if !ok {
		return []fieldkit.Error{{Path: "", Code: fieldkit.CodeInvalidType}}
	}
	var errs []fieldkit.Error
	for i, item := range items {
		at := fieldkit.JoinPath("", strconv.Itoa(i))
		id, ok := item.(string)
		switch {
		case !ok:
			errs = append(errs, fieldkit.Error{Path: at, Code: fieldkit.CodeInvalidType})
		case id == "":
			errs = append(errs, fieldkit.Error{Path: at, Code: fieldkit.CodeTooSmall, Params: map[string]any{"minimum": 1}})
		}
	}
	return errs
}
