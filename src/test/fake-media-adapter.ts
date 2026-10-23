// src/test/fake-media-adapter.ts
import { vi } from "vitest";
import type {
	FieldKitAdapters,
	MediaFilter,
	MediaItem,
	ResolvedMediaItem,
} from "../renderer/adapters";

type MediaAdapter = NonNullable<FieldKitAdapters["media"]>;

/** A workspace's assets: two PDFs and an image, so `accept` has something to
 * filter. */
export const FAKE_ASSETS: MediaItem[] = [
	{
		id: "asset-gazette",
		filename: "gazette-2026-41.pdf",
		url: "https://media.example/gazette-2026-41.pdf",
		mime_type: "application/pdf",
		size: 1_258_291,
	},
	{
		id: "asset-markup",
		filename: "marked-up.pdf",
		url: "https://media.example/marked-up.pdf",
		mime_type: "application/pdf",
		size: 2048,
	},
	{
		id: "asset-photo",
		filename: "photo.jpg",
		url: "https://media.example/photo.jpg",
		mime_type: "image/jpeg",
		size: 512,
	},
];

/** An asset deleted in the Consumer's store — `resolve` still names it. */
export const FAKE_DELETED_ASSET: ResolvedMediaItem = {
	id: "asset-gone",
	filename: "withdrawn.pdf",
	url: "",
	mime_type: "application/pdf",
	size: 100,
	deleted: true,
};

export interface FakeMediaAdapterOptions {
	/** Leave `browse` out: an adapter that cannot search (ADR-0027). */
	withoutBrowse?: boolean;
	/** Leave `resolve` out: stored ids show as themselves. */
	withoutResolve?: boolean;
}

/**
 * A media adapter over {@link FAKE_ASSETS}, every method a `vi.fn` so a test
 * can say what was asked. `browse` filters by `query` (in the file name) and
 * `mime_types` as a real store would; `resolve` answers the ids it knows,
 * {@link FAKE_DELETED_ASSET} included, and leaves out the rest.
 */
export function createFakeMediaAdapter(
	options: FakeMediaAdapterOptions = {},
): MediaAdapter & {
	upload: ReturnType<typeof vi.fn>;
	browse?: ReturnType<typeof vi.fn>;
	resolve?: ReturnType<typeof vi.fn>;
} {
	const uploaded: MediaItem[] = [];
	const upload = vi.fn(async (file: File): Promise<MediaItem> => {
		const item: MediaItem = {
			id: `asset-upload-${uploaded.length + 1}`,
			filename: file.name,
			url: `https://media.example/${file.name}`,
			mime_type: file.type,
			size: file.size,
		};
		uploaded.push(item);
		return item;
	});
	const browse = vi.fn(async (filter: MediaFilter): Promise<MediaItem[]> => {
		const query = (filter.query ?? "").toLowerCase();
		return FAKE_ASSETS.filter(
			(a) =>
				a.filename.toLowerCase().includes(query) &&
				(!filter.mime_types || filter.mime_types.includes(a.mime_type)),
		);
	});
	const resolve = vi.fn(async (ids: string[]): Promise<ResolvedMediaItem[]> => {
		const all = [...FAKE_ASSETS, FAKE_DELETED_ASSET, ...uploaded];
		return all.filter((a) => ids.includes(a.id));
	});
	return {
		upload,
		...(options.withoutBrowse ? {} : { browse }),
		...(options.withoutResolve ? {} : { resolve }),
	};
}
