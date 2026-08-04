# A Consumer freezes individual settings, and fieldkit only renders the lock

`FieldConfig` gains `locked_settings?: { key: string; reason: string }[]`. A Consumer populates it, the config panel disables exactly those controls and shows the reason beside them, and fieldkit forms no opinion about why. It exists because `pin_mode` cannot safely change once Contents exist for a Blueprint — every stored Pin becomes meaningless at once (ADR-0008) — and fieldkit has no way to know whether any Content exists: knkCMS core mints a new `BlueprintDataVersion` on every Blueprint edit and leaves each Content on its old one until `UpgradeContentBlueprintVersion` moves it, none of which is visible from inside the editor. The knowledge lives with the Consumer, so the decision does too.

The mechanism is deliberately generic rather than a `pin_mode` special case, and it generalises an instinct `field-shell.tsx` already records: lock by capability, not by testing `field.system` at the call site. `field.system` stays what it was — the whole Field is server-canonical and nothing in the panel is editable. `locked_settings` is the finer grain beneath it.

## Considered options

Letting core guard at its own boundary — rejecting the Blueprint save, or routing the change through the content upgrade where `FieldsToDelete` already lives — keeps fieldkit ignorant and puts the rule where the knowledge is. Rejected: the Author makes the edit and then loses it, and the editor goes on offering a control that sometimes cannot be used. Freezing `pin_mode` once the Field appears in the Baseline needs no Consumer cooperation at all, and was rejected as wrong in both directions: a Blueprint with no Contents could never change its mode, and the rule fieldkit would be enforcing is not the rule that matters.

## Consequences

Every settings editor must honour the list, including the ones Consumers write themselves. A settings component that ignores it renders an editable control over a frozen setting, and nothing catches that — `validateSpec()` has no way to know what a Consumer meant to freeze.

A Consumer that forgets to populate the list silently permits the breaking edit. This makes the lock *expressible*, not enforced; whatever guard core keeps at its own boundary stays necessary.

`reason` is Consumer-authored prose and so does not pass through the `labels` tables the editor localises everything else with. That is the point — only the Consumer can say "12 Contents use this Blueprint" — but it does mean the panel displays a string fieldkit never sees among its own translations.
