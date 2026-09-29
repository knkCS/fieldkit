package fieldkit

// The rich-text document boundary (ADR-0025). A rich_text Field's value is a
// document knkeditor owns: Unset stops at it — ADR-0021's canonical form, and
// CodeNotCanonical, apply to the Field's value as a whole, never inside it —
// and so does MaxDepth, which counts fieldkit's structure only. knkeditor's
// own rules (ValidateJSON) apply inside. The value caps on size, MaxItems and
// MaxStringBytes, still count the whole document: they are what keeps a
// stored value from being pathological, whoever owns it.

// documentTypes are the Field Types whose value is a document another module
// owns and validates. TS marks the same plugins opaqueDocument.
var documentTypes = map[string]bool{"rich_text": true} //nolint:gochecknoglobals

// isDocument reports whether a document type's value is a document the
// boundary protects: an object that is not Unset. {} and null are Unset at the
// Field, and not_canonical where stored; a value of the wrong type is its
// rule's invalid_type.
func isDocument(value any) bool {
	obj, ok := value.(map[string]any)
	return ok && len(obj) > 0
}

// documentPaths are the paths of every document the data's Fields hold, at
// every depth the containers reach (heldRecords), found in data as stored —
// before Unset is stripped. Hidden Fields hold documents too, and are checked
// like any other (#223 D4).
//
// Documents sit in fieldkit's structure, never deeper than MaxDepth, so the
// search reads data cut off below MaxDepth (depthBounded): a document nested
// deeper is too_deep itself, and the containers' walk never runs away down a
// pathological tree.
func (c *Catalogue) documentPaths(fields []Field, data map[string]any, targets func(string) string) map[string]bool {
	bounded, _ := depthBounded(data).(map[string]any)
	found := map[string]bool{}
	c.findDocuments(fields, bounded, "", targets, found)
	return found
}

func (c *Catalogue) findDocuments(fields []Field, record map[string]any, path string, targets func(string) string, found map[string]bool) {
	for _, f := range fields {
		if markerTypes[f.FieldType] {
			continue
		}
		value, present := record[f.Config.APIAccessor]
		if !present {
			continue
		}
		at := joinPath(path, f.Config.APIAccessor)
		if documentTypes[f.FieldType] {
			if isDocument(value) {
				found[at] = true
			}
			continue
		}
		settings, _ := canonicalSettings(f.Settings)
		settingsObj, _ := settings.(map[string]any)
		if settingsObj == nil {
			settingsObj = map[string]any{}
		}
		for _, held := range c.heldRecords(f, settingsObj, value, at, targets) {
			c.findDocuments(held.fields, held.record, held.path, targets, found)
		}
	}
}

// depthBounded is value with every container deeper than MaxDepth emptied —
// an object keeping only its _id, so the items beside it keep their paths
// (itemSegments). It copies only when value holds such a container.
func depthBounded(value any) any {
	if !deeperThan(value, 0, MaxDepth) {
		return value
	}
	return boundedCopy(value, 0)
}

func boundedCopy(value any, depth int) any {
	switch x := value.(type) {
	case []any:
		if depth > MaxDepth {
			return []any{}
		}
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = boundedCopy(item, depth+1)
		}
		return out
	case map[string]any:
		if depth > MaxDepth {
			if id, ok := x["_id"]; ok {
				return map[string]any{"_id": id}
			}
			return map[string]any{}
		}
		out := make(map[string]any, len(x))
		for key, child := range x {
			out[key] = boundedCopy(child, depth+1)
		}
		return out
	}
	return value
}

// deeperThan reports whether value, sitting at depth, holds a container
// deeper than limit.
func deeperThan(value any, depth, limit int) bool {
	switch x := value.(type) {
	case []any:
		if depth > limit {
			return true
		}
		for _, item := range x {
			if deeperThan(item, depth+1, limit) {
				return true
			}
		}
	case map[string]any:
		if depth > limit {
			return true
		}
		for _, child := range x {
			if deeperThan(child, depth+1, limit) {
				return true
			}
		}
	}
	return false
}

// stripUnsetAround is stripUnset stopping at the documents: a value whose
// path is one is kept as it is. path is value's own.
func stripUnsetAround(value any, path string, documents map[string]bool) any {
	if len(documents) == 0 {
		return stripUnset(value)
	}
	if documents[path] {
		return value
	}
	switch x := value.(type) {
	case []any:
		segments := itemSegments(x)
		out := make([]any, len(x))
		for i, item := range x {
			out[i] = stripUnsetAround(item, joinPath(path, segments[i]), documents)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(x))
		for key, child := range x {
			if canonical := stripUnsetAround(child, joinPath(path, key), documents); !isUnset(canonical) {
				out[key] = canonical
			}
		}
		return out
	}
	return value
}

// canonicalFieldValue is value, the value of the Field of fields keyed key,
// in canonical form: Unset stripped at every depth but inside the documents
// it holds (ADR-0025). Compare, Merge, Edges and Texts read it, so what they
// read and write of a document is what was stored.
func (c *Catalogue) canonicalFieldValue(fields []Field, key string, value any, targets func(string) string) any {
	documents := c.documentPaths(fields, map[string]any{key: value}, targets)
	return stripUnsetAround(value, joinPath("", key), documents)
}
