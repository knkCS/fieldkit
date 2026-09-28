package fieldkit

// ValidateSpec checks an authored Spec against the embedded Catalogue, with
// the answers TS's validateSpec gives for the same rules:
//
//   - every Field's field_type is in the Catalogue (CodeUnknownFieldType,
//     at the Field; its settings are then not checked);
//   - every Field's settings are what its type's settings schema declares
//     (CodeUnknownSetting, CodeInvalidSetting, at the setting).
//
// It walks children at every depth, whatever Field holds them. The result is
// nil for a valid Spec.
func ValidateSpec(spec Spec) []Error {
	return DefaultCatalogue().ValidateSpec(spec)
}

// ValidateSpec is the package-level ValidateSpec against this Catalogue.
func (c *Catalogue) ValidateSpec(spec Spec) []Error {
	var errs []Error
	c.validateFields(spec, "", &errs)
	return errs
}

func (c *Catalogue) validateFields(fields []Field, parent string, errs *[]Error) {
	for _, f := range fields {
		path := joinPath(parent, f.Config.APIAccessor)
		if parent != "" {
			path = joinPath(parent, "children", f.Config.APIAccessor)
		}
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
		if len(f.Children) > 0 {
			c.validateFields(f.Children, path, errs)
		}
	}
}
