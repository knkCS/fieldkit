# Unset is one state, and it is stored as absent

Absent, `null`, `""`, `[]` and `{}` all mean **Unset**, in every type's settings and values, in TS and Go. `0` and `false` are values. `required` rejects Unset; nothing can be narrowed to "none" by leaving it empty, so whoever needs "none" gives it a switch of its own — knkeditor's option forms disable a heading node rather than emptying its levels.

Unset also has **one stored form: absent**. TS and Go strip Unset keys from values and settings before they are stored or compared, and Go's `ValidateValue` rejects a value that is not in that canonical form (`not_canonical`). The reason is versionkit: it decides "added" and "removed" itself from which keys are present, so `""` beside an absent key would show as a change no one made, and could conflict in a merge.

## Considered Options

- **A tri-state, with absent meaning unset and empty meaning deliberately none.** Rejected: every optional control would need a visible "cleared vs not set" affordance for a rare case, and every field component would change.
- **Equal in meaning but stored as found.** Rejected for the phantom changes above.
