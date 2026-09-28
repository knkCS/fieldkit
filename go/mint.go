package fieldkit

import (
	"bytes"
	"crypto/sha1" //nolint:gosec // UUIDv5 is defined over SHA-1; nothing here is a secret.
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
)

// mintNamespace is the UUID namespace MintIDs derives every _id in: the
// UUIDv5 of "https://github.com/knkCS/fieldkit#_id" in the URL namespace
// (RFC 9562). Fixed for ever, so an id minted once is minted again.
var mintNamespace = uuidV5(namespaceURL, "https://github.com/knkCS/fieldkit#_id") //nolint:gochecknoglobals

// namespaceURL is RFC 9562's URL namespace, 6ba7b811-9dad-11d1-80b4-00c04fd430c8.
var namespaceURL = [16]byte{0x6b, 0xa7, 0xb8, 0x11, 0x9d, 0xad, 0x11, 0xd1, 0x80, 0xb4, 0x00, 0xc0, 0x4f, 0xd4, 0x30, 0xc8} //nolint:gochecknoglobals

// MintIDs gives every row of a Field's value an _id where it has none
// (ADR-0023): the rows of a group, a virtual_table and blocks, and the nodes
// of a reference and a single_reference, at every depth — inside rows,
// Blocks, a resolved fieldset's record and a Reference's branch. f is the
// resolved Field; value is its stored value, not the whole Content's data.
//
// It is for importers: ValidateValue never mints, and neither does anything
// else in this module. Each id is a UUIDv5 derived from seed and the row's
// place — the Field's Accessor and the indices leading to the row — so a
// re-run with the same seed mints the same ids, and a cutover can be
// rehearsed. Give each Content its own seed (its id, say): ids only need be
// unique within one Field's value, but the seed is what keeps two Contents'
// ids apart.
//
// A row is minted into when its _id is absent or Unset. An _id it already
// has is kept, well-formed or not, repeated or not: ValidateValue reports
// those. A value that is not what its type holds is returned as it is.
//
// Numbers are kept exactly as they were written; keys come back in Go's
// order (sorted), which JSON does not distinguish.
func MintIDs(f Field, value json.RawMessage, seed string) (json.RawMessage, error) {
	if len(bytes.TrimSpace(value)) == 0 {
		return value, nil
	}
	dec := json.NewDecoder(bytes.NewReader(value))
	dec.UseNumber()
	var decoded any
	if err := dec.Decode(&decoded); err != nil || dec.More() {
		return nil, fmt.Errorf("fieldkit: mint ids: value is not one JSON value")
	}
	m := minter{seed: seed}
	decoded = m.field(f, decoded, joinPath("", f.Config.APIAccessor))
	var out bytes.Buffer
	enc := json.NewEncoder(&out)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(decoded); err != nil {
		return nil, fmt.Errorf("fieldkit: mint ids: %w", err)
	}
	return bytes.TrimRight(out.Bytes(), "\n"), nil
}

type minter struct {
	seed string
}

// field mints into one Field's value, at path — the Field's own, with each
// row by its index.
func (m minter) field(f Field, value any, path string) any {
	switch f.FieldType {
	case "group", "virtual_table":
		return m.rows(value, path, func(map[string]any) []Field { return f.Children })
	case "blocks":
		settings, _ := canonicalSettings(f.Settings)
		settingsObj, _ := settings.(map[string]any)
		types := blockTypes(settingsObj)
		return m.rows(value, path, func(block map[string]any) []Field {
			typ, _ := block["_type"].(string)
			for _, bt := range types {
				if bt.typed && bt.typ == typ {
					return bt.fields
				}
			}
			return nil
		})
	case "fieldset":
		if record, ok := value.(map[string]any); ok && f.Children != nil {
			m.record(f.Children, record, path)
		}
	case "reference":
		m.nodes(value, path)
	case "single_reference":
		if node, ok := value.(map[string]any); ok {
			m.ensure(node, path)
		}
	}
	return value
}

// nodes mints into each node of a Reference Tree, at every level: a node at
// its index, its branch under "children". A Reference Spec holds no rows (its
// Position admits none), so a node's values need nothing.
func (m minter) nodes(value any, path string) {
	nodes, ok := value.([]any)
	if !ok {
		return
	}
	for i, item := range nodes {
		node, ok := item.(map[string]any)
		if !ok {
			continue
		}
		at := joinPath(path, strconv.Itoa(i))
		m.ensure(node, at)
		m.nodes(node["children"], joinPath(at, "children"))
	}
}

// ensure gives a row or node the _id of its place, unless it has one.
func (m minter) ensure(obj map[string]any, path string) {
	if id, present := obj["_id"]; !present || isUnset(id) {
		obj["_id"] = m.id(path)
	}
}

// rows mints into each row of an array: its own _id, then its Fields'.
func (m minter) rows(value any, path string, fieldsOf func(map[string]any) []Field) any {
	rows, ok := value.([]any)
	if !ok {
		return value
	}
	for i, row := range rows {
		obj, ok := row.(map[string]any)
		if !ok {
			continue
		}
		at := joinPath(path, strconv.Itoa(i))
		m.ensure(obj, at)
		m.record(fieldsOf(obj), obj, at)
	}
	return rows
}

// record mints into the values a record's Fields hold.
func (m minter) record(fields []Field, record map[string]any, path string) {
	for _, f := range fields {
		if value, present := record[f.Config.APIAccessor]; present {
			record[f.Config.APIAccessor] = m.field(f, value, joinPath(path, f.Config.APIAccessor))
		}
	}
}

// id is the _id of the row at path: the UUIDv5 of the seed and the path.
func (m minter) id(path string) string {
	return uuidString(uuidV5(mintNamespace, m.seed+"\x00"+path))
}

// uuidV5 is RFC 9562's name-based UUID over SHA-1.
func uuidV5(namespace [16]byte, name string) [16]byte {
	h := sha1.New() //nolint:gosec // see the import
	h.Write(namespace[:])
	h.Write([]byte(name))
	var u [16]byte
	copy(u[:], h.Sum(nil))
	u[6] = (u[6] & 0x0f) | 0x50
	u[8] = (u[8] & 0x3f) | 0x80
	return u
}

func uuidString(u [16]byte) string {
	s := hex.EncodeToString(u[:])
	return s[0:8] + "-" + s[8:12] + "-" + s[12:16] + "-" + s[16:20] + "-" + s[20:]
}
