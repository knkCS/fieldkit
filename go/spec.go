package fieldkit

import (
	"encoding/json"
	"fmt"
)

// Spec is a list of Fields: a Blueprint's, a Row Spec, a Reference Spec.
type Spec []Field

// Field is one Field definition, as TS's Field type declares it.
//
// It is decoded strictly (DecodeSpec): a property it does not model is an
// error, never dropped, so a Spec round-tripped through it loses nothing
// (ADR-0020). Settings stay raw JSON — they belong to the type, and
// ValidateSettings reads them against the Catalogue.
type Field struct {
	FieldType  string          `json:"field_type"`
	Config     Config          `json:"config"`
	Validation *Validation     `json:"validation,omitempty"`
	Settings   json.RawMessage `json:"settings,omitempty"`
	Children   []Field         `json:"children,omitempty"`
	System     bool            `json:"system"`
}

// Config is the configuration every Field Type shares.
type Config struct {
	Name         string          `json:"name"`
	APIAccessor  string          `json:"api_accessor"`
	Required     bool            `json:"required"`
	Instructions string          `json:"instructions"`
	DefaultValue json.RawMessage `json:"default_value,omitempty"`
	Unique       *bool           `json:"unique,omitempty"`
	Localizable  *bool           `json:"localizable,omitempty"`
	Hidden       *bool           `json:"hidden,omitempty"`
	ReadOnly     *bool           `json:"read_only,omitempty"`
	Condition    *Condition      `json:"condition,omitempty"`
	// Search is how the Field's text weighs in Delivery Search: "off", or a
	// weight "A" to "D". "" is Unset. Valid only on a type the Catalogue
	// marks as having text.
	Search         string          `json:"search,omitempty"`
	LockedSettings []LockedSetting `json:"locked_settings,omitempty"`
}

// Validation holds the value rules a Field's config carries beside its
// settings.
type Validation struct {
	MinLength      *float64 `json:"min_length,omitempty"`
	MaxLength      *float64 `json:"max_length,omitempty"`
	Pattern        *string  `json:"pattern,omitempty"`
	PatternMessage *string  `json:"pattern_message,omitempty"`
}

// Condition shows or hides a Field by another Field's value.
type Condition struct {
	Field    string          `json:"field"`
	Operator string          `json:"operator"`
	Value    json.RawMessage `json:"value,omitempty"`
}

// LockedSetting is a settings key a Consumer has frozen, and why (ADR-0011).
type LockedSetting struct {
	Key    string `json:"key"`
	Reason string `json:"reason"`
}

// DecodeSpec decodes a Spec strictly: a property the model does not declare,
// at any depth, is an error, as is anything after the Spec.
func DecodeSpec(data []byte) (Spec, error) {
	var spec Spec
	if err := decodeStrict(data, &spec); err != nil {
		return nil, fmt.Errorf("fieldkit: decode spec: %w", err)
	}
	return spec, nil
}
