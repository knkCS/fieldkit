package fieldkit

// ValidateSpec checks an authored Spec against the embedded Catalogue, with
// the answers TS's validateSpec gives for the same rules:
//
//   - every Field's field_type is in the Catalogue (CodeUnknownFieldType,
//     at the Field; its settings are then not checked);
//   - every Field's settings are what its type's settings schema declares
//     (CodeUnknownSetting, CodeInvalidSetting, at the setting);
//   - the rules across settings a type has beside its schema (rules.go):
//     a Virtual Table's Row Spec (ADR-0017), and a Blocks Field's Block
//     Types.
//
// It walks every Spec a Field holds, at every depth: its children, whatever
// Field holds them, and a Blocks Field's Block Types' Fields, which live in its
// settings. A Field in a Block Type is at
// "/content/settings/allowed_blocks/0/fields/title". The result is nil for a
// valid Spec.
//
// TS's validateSpec checks rules this does not implement yet — empty names
// and Accessors, duplicate Accessors, the card-layout rule — and the
// conformance fixtures stay clear of them.
//
// The Catalogue lists only the types that already declare a settings schema.
// Until every built-in type does, a Spec using another built-in type — select,
// reference, … — is valid in TS and reports unknown_field_type here, and a
// Row Spec holding one reports virtual_table_row_field_type here, since a type
// the Catalogue does not list has no "row" Position. The conformance fixtures
// stay inside the Catalogue, where the two agree.
func ValidateSpec(spec Spec) []Error {
	return DefaultCatalogue().ValidateSpec(spec)
}

// ValidateSpec is the package-level ValidateSpec against this Catalogue.
func (c *Catalogue) ValidateSpec(spec Spec) []Error {
	var errs []Error
	c.validateFields(spec, "", &errs)
	return errs
}

// validateFields validates a list of Fields at list, the path of the list
// itself: "" for the root, ".../children" for a Field's children.
func (c *Catalogue) validateFields(fields []Field, list string, errs *[]Error) {
	for _, f := range fields {
		path := joinPath(list, f.Config.APIAccessor)
		if _, ok := c.Type(f.FieldType); !ok {
			*errs = append(*errs, Error{
				Path:   path,
				Code:   CodeUnknownFieldType,
				Params: map[string]any{"field_type": f.FieldType},
			})
		} else {
			settingsPath := joinPath(path, "settings")
			for _, e := range c.ValidateSettings(f.FieldType, f.Settings) {
				e.Path = settingsPath + e.Path
				*errs = append(*errs, e)
			}
		}
		rules := rulesFor(f.FieldType)
		if rules.field != nil {
			settings, _ := canonicalSettings(f.Settings)
			for _, e := range rules.field(c, f, settings) {
				e.Path = path + e.Path
				*errs = append(*errs, e)
			}
		}
		if len(f.Children) > 0 {
			c.validateFields(f.Children, joinPath(path, "children"), errs)
		}
		if rules.specs != nil {
			held, specErrs := rules.specs(f.Settings)
			for _, e := range specErrs {
				e.Path = path + e.Path
				*errs = append(*errs, e)
			}
			for _, h := range held {
				c.validateFields(h.fields, path+h.path, errs)
			}
		}
	}
}
