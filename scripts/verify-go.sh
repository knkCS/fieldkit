#!/usr/bin/env bash
# verify-go — the Go module's gate, run by `npm run verify` so the gate stays
# one command: gofmt, go vet, go test. Fails when any of them fails.
#
# What it checks mirrors the org's go-service-ci.yml (which the Go workflow
# calls), with two local differences:
#
# - Untracked Go files are checked too (`--others --exclude-standard`), so a
#   new file is gated before it is committed. A nested worktree under
#   .claude/worktrees/ is its own repository, so git lists it as one entry and
#   never its files.
# - GOWORK=off: a go.work in a directory above this checkout (a developer's
#   workspace over many repos) would otherwise take this module over and fail
#   because it does not list it.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
export GOWORK=off

command -v go >/dev/null || {
	echo "verify-go: the go toolchain is not installed (see go/go.mod for the version)" >&2
	exit 1
}

files=()
while IFS= read -r -d '' file; do
	files+=("$file")
done < <(git ls-files -z --cached --others --exclude-standard -- '*.go')
if [ "${#files[@]}" -eq 0 ]; then
	echo "verify-go: no Go files found" >&2
	exit 1
fi

# A non-zero exit is the gate as much as a non-empty list: on a file it cannot
# parse, gofmt prints nothing on stdout and exits 2.
if ! unformatted="$(gofmt -l "${files[@]}")"; then
	echo "verify-go: gofmt could not read a Go file — its own error is above" >&2
	exit 1
fi
if [ -n "$unformatted" ]; then
	echo "verify-go: these Go files are not gofmt-clean (fix with gofmt -w):" >&2
	echo "$unformatted" | sed 's/^/  /' >&2
	exit 1
fi
echo "gofmt: clean"

cd go
go vet ./...
echo "go vet: clean"
# -count=1: the conformance fixtures live outside the module, and a cached
# pass must never stand in for a run over changed fixtures.
go test -count=1 ./...
