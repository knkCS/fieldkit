import { useCallback, useState } from "react";
import type { FieldKitAdapters, ReferenceItem } from "../adapters";

interface UseResolvedReferencesOptions {
	adapter: FieldKitAdapters["reference"];
	blueprints: string[];
}

interface UseResolvedReferencesResult {
	resolved: ReferenceItem[];
	loading: boolean;
	error: string | null;
	search: (query: string) => void;
	searchResults: ReferenceItem[];
	searching: boolean;
	clearSearch: () => void;
	resolveIds: (ids: string[]) => void;
}

export function useResolvedReferences({
	adapter,
	blueprints,
}: UseResolvedReferencesOptions): UseResolvedReferencesResult {
	const [resolved, setResolved] = useState<ReferenceItem[]>([]);
	const [searchResults, setSearchResults] = useState<ReferenceItem[]>([]);
	const [loading, setLoading] = useState(false);
	const [searching, setSearching] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const resolveIds = useCallback(
		async (ids: string[]) => {
			if (!adapter || ids.length === 0) {
				setResolved([]);
				return;
			}
			setLoading(true);
			setError(null);
			try {
				const items = await adapter.fetch(ids);
				setResolved(items);
			} catch (e) {
				console.error("Failed to resolve reference IDs:", e);
				setError("Failed to load references");
			} finally {
				setLoading(false);
			}
		},
		[adapter],
	);

	const search = useCallback(
		async (query: string) => {
			if (!adapter || query.length === 0) {
				setSearchResults([]);
				return;
			}
			setSearching(true);
			setError(null);
			try {
				const results = await adapter.search(blueprints, query);
				setSearchResults(results);
			} catch (e) {
				console.error("Failed to search references:", e);
				setSearchResults([]);
				setError("Search failed");
			} finally {
				setSearching(false);
			}
		},
		[adapter, blueprints],
	);

	const clearSearch = useCallback(() => {
		setSearchResults([]);
	}, []);

	return {
		resolved,
		loading,
		error,
		search,
		searchResults,
		searching,
		clearSearch,
		resolveIds,
	};
}
