package fieldkit

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"sync"
)

// catalogueJSON is the Catalogue, generated from the TS plugins' settings
// schemas by scripts/catalogue.ts and committed. `npm run verify` fails when
// it is stale.
//
//go:embed catalogue.json
var catalogueJSON []byte

// Catalogue is every Field Type one fieldkit release knows, described as
// data (ADR-0018). It only ever grows (ADR-0019).
type Catalogue struct {
	// Version is the fieldkit version this Catalogue ships in.
	Version string `json:"version"`
	// Types are sorted by ID.
	Types []CatalogueType `json:"types"`

	byID map[string]*CatalogueType
	// code is the code of a Catalogue section's types (extension.go); nil
	// for the built-in types alone, whose rules live in this package.
	code map[string]TypeCode
}

// CatalogueType is what the Catalogue records about one Field Type.
type CatalogueType struct {
	ID string `json:"id"`
	// Since is the fieldkit version whose Catalogue first listed the type.
	Since string `json:"since"`
	// SettingsSchema is the JSON Schema of the type's settings.
	SettingsSchema *Schema `json:"settings_schema"`
	// Positions are where in a Spec a Field of this type may sit (ADR-0022).
	Positions []string `json:"positions"`
	// Consumers are the Consumers whose type picker offers the type. Advice
	// for pickers only: nothing in this module reads it.
	Consumers []string `json:"consumers"`
	// Pins are the settings keys that hold a Pin, and what each pins.
	Pins []CataloguePin `json:"pins"`
	// HasText is whether a value of the type yields text.
	HasText bool `json:"has_text"`
}

// CataloguePin is one setting that holds a Pin, and the kind of Release it
// pins. Key is a /-separated settings path in which * stands for every item
// of a list: "blueprint" is one setting, "blueprints/*/spec_blueprint" one per
// blueprints entry (a Reference Field's linked Reference Specs).
type CataloguePin struct {
	Key  string `json:"key"`
	Kind string `json:"kind"`
}

var (
	defaultCatalogue     *Catalogue
	defaultCatalogueOnce sync.Once
)

// DefaultCatalogue returns the Catalogue this module embeds. It is shared:
// do not modify it.
func DefaultCatalogue() *Catalogue {
	defaultCatalogueOnce.Do(func() {
		c, err := ParseCatalogue(catalogueJSON)
		if err != nil {
			// The embedded Catalogue is generated and tested with this
			// module, so it always parses.
			panic(fmt.Errorf("fieldkit: the embedded Catalogue is invalid: %w", err))
		}
		defaultCatalogue = c
	})
	return defaultCatalogue
}

// ParseCatalogue decodes a Catalogue strictly: a property this module does
// not model is an error, so a Catalogue newer than the module is refused
// rather than half-understood.
func ParseCatalogue(data []byte) (*Catalogue, error) {
	var c Catalogue
	if err := decodeStrict(data, &c); err != nil {
		return nil, err
	}
	c.byID = make(map[string]*CatalogueType, len(c.Types))
	for i := range c.Types {
		t := &c.Types[i]
		if t.ID == "" {
			return nil, fmt.Errorf("type %d has no id", i)
		}
		if _, dup := c.byID[t.ID]; dup {
			return nil, fmt.Errorf("type %q is listed twice", t.ID)
		}
		if t.SettingsSchema == nil {
			return nil, fmt.Errorf("type %q has no settings_schema", t.ID)
		}
		c.byID[t.ID] = t
	}
	return &c, nil
}

// Type returns the Catalogue's entry for a Field Type id.
func (c *Catalogue) Type(id string) (*CatalogueType, bool) {
	t, ok := c.byID[id]
	return t, ok
}

// decodeStrict decodes one JSON value into v, refusing unknown properties
// and anything after the value.
func decodeStrict(data []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return fmt.Errorf("unexpected data after the JSON value")
	}
	return nil
}
