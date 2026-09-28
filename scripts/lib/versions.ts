/**
 * The version numbers a release deals in: `X.Y.Z`, or a release candidate
 * `X.Y.Z-rc.N`. Nothing else is a fieldkit release — npm and the Go module
 * share one number (ADR-0018), and both accept exactly these.
 */

export interface Version {
	major: number;
	minor: number;
	patch: number;
	/** The candidate number of `X.Y.Z-rc.N`; absent on a final release. */
	rc?: number;
}

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.([1-9]\d*))?$/;

export function parseVersion(text: string): Version | undefined {
	const match = VERSION.exec(text);
	if (!match) return undefined;
	const [, major, minor, patch, rc] = match;
	return {
		major: Number(major),
		minor: Number(minor),
		patch: Number(patch),
		...(rc === undefined ? {} : { rc: Number(rc) }),
	};
}

/** Whether `text` names a final release, `X.Y.Z` — the only kind frozen. */
export function isFinalVersion(text: string): boolean {
	const version = parseVersion(text);
	return version !== undefined && version.rc === undefined;
}

/** `X.Y.Z` of `X.Y.Z` or of `X.Y.Z-rc.N`: the release a candidate is for. */
export function finalOf(text: string): string {
	const version = mustParse(text);
	return `${version.major}.${version.minor}.${version.patch}`;
}

/** Semver order: a candidate sorts before its final release. */
export function compareVersions(a: string, b: string): number {
	const x = mustParse(a);
	const y = mustParse(b);
	return (
		x.major - y.major ||
		x.minor - y.minor ||
		x.patch - y.patch ||
		(x.rc ?? Number.POSITIVE_INFINITY) - (y.rc ?? Number.POSITIVE_INFINITY) ||
		0
	);
}

function mustParse(text: string): Version {
	const version = parseVersion(text);
	if (!version) {
		throw new Error(`"${text}" is not a release version (X.Y.Z or X.Y.Z-rc.N)`);
	}
	return version;
}
