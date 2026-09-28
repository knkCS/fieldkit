package publishing

import fieldkit "github.com/knkcs/fieldkit/go"

// templateText is template_text: the source of a template a service renders
// into generated Content. fieldkit checks that it is a string and nothing
// more — whether it parses, and what its placeholders may name, is the
// rendering service's rule. Its one setting, context_blueprints, is Blueprint
// ids an editor offers placeholders from, not Pins, and the Catalogue's schema
// checks it whole. It has no text and no edges, and compares and merges as a
// whole value.
var templateText = fieldkit.TypeCode{ //nolint:gochecknoglobals
	Value: templateTextValue,
}

// templateTextValue is the Go reading of its toZodType, z.string(). A
// required Field's "" is Unset, which ValidateValue reports as required
// before this runs.
func templateTextValue(_ fieldkit.Field, _ map[string]any, value any, _ fieldkit.TypeEnv) []fieldkit.Error {
	if _, ok := value.(string); !ok {
		return []fieldkit.Error{{Path: "", Code: fieldkit.CodeInvalidType}}
	}
	return nil
}
