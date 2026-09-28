#!/usr/bin/env bash
# fuzz-go — fuzz every Fuzz target of the Go module for a bounded time each
# (fieldkit#222). `go test` alone only replays each target's seed corpus; this
# mutates inputs for real. Go fuzzes one target per invocation, so the targets
# run one after another.
#
#   bash scripts/fuzz-go.sh [fuzztime]    # default 3s per target
#
# `npm run verify` runs it at the default (short) time, `npm run verify:full`
# at 60s per target. A failing input is written to
# go/testdata/fuzz/<target>/ — commit it with the fix: from then on plain
# `go test` replays it as a regression case.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/go"
export GOWORK=off

fuzztime="${1:-3s}"

targets=()
while IFS= read -r line; do
	case "$line" in
	Fuzz*) targets+=("$line") ;;
	esac
done < <(go test -list 'Fuzz.*' .)
if [ "${#targets[@]}" -eq 0 ]; then
	echo "fuzz-go: no Fuzz targets found" >&2
	exit 1
fi

for target in "${targets[@]}"; do
	echo "fuzz-go: $target for $fuzztime"
	go test -run '^$' -fuzz "^${target}\$" -fuzztime "$fuzztime" .
done
echo "fuzz-go: ${#targets[@]} targets, no failing input"
