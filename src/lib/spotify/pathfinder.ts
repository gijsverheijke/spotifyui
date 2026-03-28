// Pathfinder GraphQL client for Spotify's internal web player API.
// Uses persisted queries against api-partner.spotify.com/pathfinder/v1/query.
// The real web player uses this instead of the REST API (api.spotify.com/v1/*).

const PATHFINDER_URL =
  "https://api-partner.spotify.com/pathfinder/v1/query";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Fallback hashes captured from live Spotify web player (2026-03-28).
// These change when Spotify deploys new JS bundles. The HashResolver
// dynamically scrapes current hashes; these are only used when that fails.
const FALLBACK_HASHES: Record<string, string> = {
  accountAttributes:
    "3030aeca7614b9e00b728c91383fff23d1a7c2982929dc5c9db3dc35e2e5c0be",
  areEntitiesInLibrary:
    "134337999233cc6fdd6b1e6dbf94841409f04a946c5c7b744b09ba0dfe5a85ed",
  fetchEntitiesForRecentlyPlayed:
    "5bb408450626d595cb24363104b612e14f9b966430f599121696e8996ea03794",
  fetchExtractedColors:
    "36e90fcaea00d47c695fce31874efeb2519b97d4cd0ee1abfb4f8dc9348596ea",
  fetchLibraryTracks:
    "087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240",
  fetchPlaylist:
    "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  fetchPlaylistContents:
    "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  fetchPlaylistMetadata:
    "30d415ed189d2699051b60bd0b17ea06467a01bc26d44e8058975e37e9f5fbf6",
  home: "3e8e118c033b10353783ec0404451de66ed44e5cb5e0caefc65e4fab7b9e0aef",
  isCurated:
    "e4ed1f91a2cc5415befedb85acf8671dc1a4bf3ca1a5b945a6386101a22e28a6",
  libraryV3:
    "973e511ca44261fda7eebac8b653155e7caee3675abb4fb110cc1b8c78b091c3",
  playlistPermissions:
    "f4c99a92059b896b9e4e567403abebe666c0625a36286f9c2bb93961374a75c6",
  profileAttributes:
    "53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced",
  searchDesktop:
    "841750deaa0a25991df1437c43b1c7188da731ca311039581a6543c96dd07dfa",
};

// ---------------------------------------------------------------------------
// Hash Resolver — scrapes persisted-query hashes from Spotify's web player JS
// ---------------------------------------------------------------------------

export class HashResolver {
  private hashes = new Map<string, string>();
  private loadPromise: Promise<void> | null = null;
  private loaded = false;

  async getHash(operation: string): Promise<string> {
    const cached = this.hashes.get(operation);
    if (cached) return cached;

    if (!this.loaded) {
      if (!this.loadPromise) {
        this.loadPromise = this.loadAll().finally(() => {
          this.loaded = true;
          this.loadPromise = null;
        });
      }
      await this.loadPromise;
      const resolved = this.hashes.get(operation);
      if (resolved) return resolved;
    }

    const fallback = FALLBACK_HASHES[operation];
    if (fallback) {
      console.log(`[pathfinder] using fallback hash for ${operation}`);
      return fallback;
    }

    throw new Error(`No hash available for operation: ${operation}`);
  }

  invalidate(): void {
    this.hashes.clear();
    this.loaded = false;
    this.loadPromise = null;
  }

  private async loadAll(): Promise<void> {
    const allOps = Object.keys(FALLBACK_HASHES);
    try {
      const html = await fetchText("https://open.spotify.com/");
      const bundleUrl = pickWebPlayerBundle(html);
      if (!bundleUrl) {
        console.log("[pathfinder] no web player bundle found in HTML");
        return;
      }

      const bundleBase =
        bundleUrl.substring(0, bundleUrl.lastIndexOf("/") + 1);
      const mainBody = await fetchText(bundleUrl);

      const found = findOperationHashes(mainBody, allOps);
      for (const [op, hash] of Object.entries(found)) {
        this.hashes.set(op, hash);
      }

      let missing = allOps.filter((op) => !this.hashes.has(op));
      if (missing.length === 0) return;

      const chunks = parseAndCombineChunks(mainBody);
      for (const chunk of chunks) {
        if (missing.length === 0) break;
        try {
          const body = await fetchText(bundleBase + chunk);
          const chunkFound = findOperationHashes(body, missing);
          for (const [op, hash] of Object.entries(chunkFound)) {
            this.hashes.set(op, hash);
          }
          missing = missing.filter((op) => !this.hashes.has(op));
        } catch {
          // skip unavailable chunks
        }
      }

      if (missing.length > 0) {
        console.log(
          `[pathfinder] could not resolve hashes for: ${missing.join(", ")}`,
        );
      }
    } catch (err) {
      console.log("[pathfinder] hash resolution failed:", err);
    }
  }
}

// ---------------------------------------------------------------------------
// Bundle parsing
// ---------------------------------------------------------------------------

async function fetchText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching ${url}`);
  return resp.text();
}

function pickWebPlayerBundle(html: string): string | null {
  const re = /<script[^>]+src="([^"]+)"/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    const src = match[1];
    if (
      src.endsWith(".js") &&
      (src.includes("/web-player/") ||
        src.includes("/mobile-web-player/"))
    ) {
      return src;
    }
  }
  return null;
}

function findOperationHashes(
  body: string,
  ops: string[],
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const op of ops) {
    const escaped = op.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Pattern 1: operationName...sha256Hash":"<64-hex>"
    let re = new RegExp(
      escaped +
        '[\\s\\S]{0,400}?sha256Hash\\":\\"([a-f0-9]{64})\\"',
    );
    let m = body.match(re);
    if (m) {
      found[op] = m[1];
      continue;
    }
    // Pattern 2: "operationName","query|mutation","<64-hex>"
    re = new RegExp(
      '"' + escaped + '","(?:query|mutation)","([a-f0-9]{64})"',
    );
    m = body.match(re);
    if (m) {
      found[op] = m[1];
    }
  }
  return found;
}

function parseAndCombineChunks(js: string): string[] {
  const re = /\{(?:\d+:"[^"]+",?)+\}/g;
  const matches = js.match(re);
  if (!matches) return [];

  type ScoredMap = { score: number; data: Map<number, string> };
  const hashMaps: ScoredMap[] = [];
  const nameMaps: ScoredMap[] = [];

  for (const raw of matches) {
    const parsed = parseMapLiteral(raw);
    if (!parsed || parsed.size === 0) continue;
    const hs = scoreHashMap(parsed);
    const ns = scoreNameMap(parsed);
    if (hs > 0.4) hashMaps.push({ score: hs, data: parsed });
    if (ns > 0.4) nameMaps.push({ score: ns, data: parsed });
  }

  if (hashMaps.length === 0 || nameMaps.length === 0) return [];
  hashMaps.sort((a, b) => b.score - a.score);
  nameMaps.sort((a, b) => b.score - a.score);

  const nameMap = nameMaps[0].data;
  const hashMap = hashMaps[0].data;
  const keys = [...nameMap.keys()]
    .filter((k) => hashMap.has(k))
    .sort((a, b) => a - b);
  return keys.map((k) => `${nameMap.get(k)}.${hashMap.get(k)}.js`);
}

function parseMapLiteral(raw: string): Map<number, string> | null {
  try {
    const mapped = raw.replace(/(\d+):/g, '"$1":');
    const temp: Record<string, string> = JSON.parse(mapped);
    const result = new Map<number, string>();
    for (const [key, value] of Object.entries(temp)) {
      const num = parseInt(key, 10);
      if (!isNaN(num)) result.set(num, value);
    }
    return result;
  } catch {
    return null;
  }
}

function scoreHashMap(m: Map<number, string>): number {
  if (m.size === 0) return 0;
  let hits = 0;
  for (const v of m.values()) {
    if (/^[0-9a-f]+$/.test(v) && v.length >= 6 && v.length <= 12) hits++;
  }
  return hits / m.size;
}

function scoreNameMap(m: Map<number, string>): number {
  if (m.size === 0) return 0;
  let hits = 0;
  for (const v of m.values()) {
    if (v.includes("-") || v.includes("/")) hits++;
  }
  return hits / m.size;
}

// ---------------------------------------------------------------------------
// GraphQL query executor
// ---------------------------------------------------------------------------

export interface PathfinderAuth {
  accessToken: string;
  clientToken: string | null;
  clientVersion: string;
}

export class PathfinderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathfinderAuthError";
  }
}

export class PathfinderHashError extends Error {
  operation: string;
  constructor(operation: string) {
    super(`Hash invalidated for ${operation}`);
    this.name = "PathfinderHashError";
    this.operation = operation;
  }
}

export async function pathfinderQuery(
  operation: string,
  variables: Record<string, unknown>,
  auth: PathfinderAuth,
  hashResolver: HashResolver,
): Promise<Record<string, unknown>> {
  const hash = await hashResolver.getHash(operation);

  const params = new URLSearchParams();
  params.set("operationName", operation);
  params.set("variables", JSON.stringify(variables));
  params.set(
    "extensions",
    JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }),
  );

  const url = `${PATHFINDER_URL}?${params}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    "Accept-Language": "en",
    "app-platform": "WebPlayer",
    "Spotify-App-Version": auth.clientVersion,
  };
  if (auth.clientToken) {
    headers["Client-Token"] = auth.clientToken;
  }

  console.log(`[pathfinder] ${operation}`);
  const t0 = Date.now();
  const resp = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  console.log(
    `[pathfinder] ${operation}: ${resp.status} in ${Date.now() - t0}ms`,
  );

  if (resp.status === 401) {
    throw new PathfinderAuthError("Unauthorized");
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (body.includes("PersistedQueryNotFound")) {
      hashResolver.invalidate();
      throw new PathfinderHashError(operation);
    }
    throw new Error(
      `Pathfinder ${operation}: HTTP ${resp.status} ${body.slice(0, 200)}`,
    );
  }

  const payload = (await resp.json()) as Record<string, unknown>;

  const errors = payload.errors as Array<{ message?: string }> | undefined;
  if (errors?.length) {
    const msg = errors[0]?.message ?? "Unknown GraphQL error";
    if (msg.includes("PersistedQueryNotFound")) {
      hashResolver.invalidate();
      throw new PathfinderHashError(operation);
    }
    throw new Error(`Pathfinder ${operation}: ${msg}`);
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Response extraction helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMap = Record<string, any>;

export function getNestedMap(
  obj: unknown,
  ...path: string[]
): AnyMap | null {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== "object") return null;
    current = (current as AnyMap)[key];
  }
  if (
    current != null &&
    typeof current === "object" &&
    !Array.isArray(current)
  ) {
    return current as AnyMap;
  }
  return null;
}

export function getString(obj: AnyMap | null, key: string): string {
  if (!obj) return "";
  const v = obj[key];
  return typeof v === "string" ? v : "";
}

export function getNumber(obj: AnyMap | null, key: string): number {
  if (!obj) return 0;
  const v = obj[key];
  return typeof v === "number" ? v : 0;
}

export function idFromUri(uri: string): string {
  const parts = uri.split(":");
  return parts.length >= 3 ? parts[parts.length - 1] : uri;
}

export function typeFromUri(uri: string): string {
  const parts = uri.split(":");
  return parts.length >= 3 ? parts[parts.length - 2] : "";
}

/** Extract images from various GraphQL nesting patterns. */
export function extractImages(
  m: AnyMap,
): { url: string; height: number | null; width: number | null }[] {
  // coverArt.sources[]
  if (m.coverArt?.sources?.length) {
    return m.coverArt.sources.map((s: AnyMap) => ({
      url: s.url ?? "",
      height: typeof s.height === "number" ? s.height : null,
      width: typeof s.width === "number" ? s.width : null,
    }));
  }
  // images.items[].sources[]
  if (m.images?.items?.length) {
    const out: { url: string; height: number | null; width: number | null }[] =
      [];
    for (const item of m.images.items) {
      if (item?.sources?.length) {
        out.push({
          url: item.sources[0].url ?? "",
          height:
            typeof item.sources[0].height === "number"
              ? item.sources[0].height
              : null,
          width:
            typeof item.sources[0].width === "number"
              ? item.sources[0].width
              : null,
        });
      }
    }
    if (out.length) return out;
  }
  // visuals.avatarImage.sources[]
  if (m.visuals?.avatarImage?.sources?.length) {
    return m.visuals.avatarImage.sources.map((s: AnyMap) => ({
      url: s.url ?? "",
      height: typeof s.height === "number" ? s.height : null,
      width: typeof s.width === "number" ? s.width : null,
    }));
  }
  // avatar.sources[]
  if (m.avatar?.sources?.length) {
    return m.avatar.sources.map((s: AnyMap) => ({
      url: s.url ?? "",
      height: typeof s.height === "number" ? s.height : null,
      width: typeof s.width === "number" ? s.width : null,
    }));
  }
  return [];
}

/** Extract artist info from various GraphQL nesting patterns. */
export function extractArtistList(
  m: AnyMap,
): { id: string; name: string; uri: string; type: "artist"; external_urls: { spotify: string } }[] {
  const results: {
    id: string;
    name: string;
    uri: string;
    type: "artist";
    external_urls: { spotify: string };
  }[] = [];
  const seen = new Set<string>();

  function add(uri: string, name: string) {
    const id = idFromUri(uri);
    const key = id || name;
    if (!key || seen.has(key)) return;
    seen.add(key);
    results.push({
      id,
      name,
      uri: uri || `spotify:artist:${id}`,
      type: "artist",
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
    });
  }

  function processEntry(entry: AnyMap) {
    if (!entry || typeof entry !== "object") return;
    // { uri, profile: { name } }
    if (entry.profile?.name) {
      add(entry.uri ?? "", entry.profile.name);
      return;
    }
    // { node: { ... } }
    if (entry.node) {
      processEntry(entry.node);
      return;
    }
    // { id, name, uri }
    const name = entry.name ?? "";
    const uri = entry.uri ?? "";
    if (name && (uri.includes("artist") || entry.id)) {
      add(uri || `spotify:artist:${entry.id ?? ""}`, name);
    }
  }

  function processList(list: unknown) {
    if (!Array.isArray(list)) return;
    for (const e of list) processEntry(e);
  }

  const artists = m.artists;
  if (Array.isArray(artists)) {
    processList(artists);
  } else if (artists && typeof artists === "object") {
    processList(artists.items);
    processList(artists.nodes);
    processList(artists.edges);
  }
  if (m.firstArtist) {
    processList(m.firstArtist.items ?? m.firstArtist.nodes);
  }
  if (m.otherArtists) {
    processList(m.otherArtists.items ?? m.otherArtists.nodes);
  }

  return results;
}

/** Extract album info from a track's GraphQL data. */
export function extractAlbumInfo(m: AnyMap): {
  id: string;
  name: string;
  uri: string;
  type: "album";
  external_urls: { spotify: string };
  images: { url: string; height: number | null; width: number | null }[];
} | null {
  const src = m.albumOfTrack ?? m.album;
  if (!src || typeof src !== "object") return null;
  const uri = src.uri ?? "";
  const id = idFromUri(uri);
  return {
    id,
    name: src.name ?? "",
    uri,
    type: "album",
    external_urls: { spotify: `https://open.spotify.com/album/${id}` },
    images: extractImages(src),
  };
}

/** Extract duration in ms from various patterns. */
export function extractDurationMs(m: AnyMap): number {
  if (m.duration?.totalMilliseconds) return m.duration.totalMilliseconds;
  if (m.duration_ms) return m.duration_ms;
  if (m.durationMs) return m.durationMs;
  return 0;
}

/** Build a normalized track object from GraphQL data. */
export function normalizeTrack(m: AnyMap): AnyMap {
  const uri = m.uri ?? "";
  const id = idFromUri(uri);
  return {
    id,
    name: m.name ?? m.title ?? "",
    type: "track",
    uri,
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
    artists: extractArtistList(m),
    album: extractAlbumInfo(m) ?? {
      id: "",
      name: "",
      type: "album",
      uri: "",
      external_urls: { spotify: "" },
      images: [],
    },
    duration_ms: extractDurationMs(m),
    explicit: m.explicit ?? m.isExplicit ?? false,
    popularity: 0,
    preview_url: null,
    track_number: m.trackNumber ?? m.track_number ?? 0,
    disc_number: m.discNumber ?? m.disc_number ?? 1,
    is_local: false,
  };
}

/** Build a normalized artist object from GraphQL data. */
export function normalizeArtist(m: AnyMap): AnyMap {
  const uri = m.uri ?? "";
  const id = idFromUri(uri);
  const name =
    m.profile?.name ?? m.name ?? "";
  return {
    id,
    name,
    type: "artist",
    uri,
    external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
    followers: { href: null, total: m.stats?.followers ?? 0 },
    genres: [],
    images: extractImages(m),
    popularity: 0,
  };
}

/** Build a normalized playlist object from GraphQL data. */
export function normalizePlaylistSimplified(m: AnyMap): AnyMap {
  const uri = m.uri ?? "";
  const id = idFromUri(uri);
  const ownerData = m.ownerV2?.data ?? m.owner ?? {};
  const ownerId = idFromUri(ownerData.uri ?? "");
  return {
    id,
    name: m.name ?? "",
    type: "playlist",
    uri,
    external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
    description: m.description ?? null,
    images: extractImages(m),
    owner: {
      id: ownerId,
      display_name: ownerData.name ?? ownerData.display_name ?? null,
      type: "user",
      uri: ownerData.uri ?? "",
      external_urls: {
        spotify: `https://open.spotify.com/user/${ownerId}`,
      },
    },
    public: null,
    collaborative: false,
    tracks: { href: "", total: m.content?.totalCount ?? 0 },
    snapshot_id: "",
  };
}

/** Build a normalized album object from GraphQL data. */
export function normalizeAlbum(m: AnyMap): AnyMap {
  const uri = m.uri ?? "";
  const id = idFromUri(uri);
  return {
    id,
    name: m.name ?? "",
    type: "album",
    album_type: m.type ?? "album",
    uri,
    external_urls: { spotify: `https://open.spotify.com/album/${id}` },
    images: extractImages(m),
    artists: extractArtistList(m),
    release_date: m.date?.isoString ?? m.releaseDate ?? "",
    release_date_precision: "day",
    total_tracks: m.tracks?.totalCount ?? m.totalTracks ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Collection extractors (navigate specific GraphQL response structures)
// ---------------------------------------------------------------------------

/** Search results: data.searchV2.<category>.items */
export function extractSearchCategory(
  searchV2: AnyMap | null,
  pathOptions: string[],
  kind: string,
  limit: number,
  offset: number,
): AnyMap {
  if (!searchV2) {
    return { items: [], total: 0, limit, offset, href: "", next: null, previous: null };
  }

  let container: AnyMap | null = null;
  for (const path of pathOptions) {
    container = searchV2[path] as AnyMap | undefined ?? null;
    if (container) break;
  }

  if (!container) {
    return { items: [], total: 0, limit, offset, href: "", next: null, previous: null };
  }

  const rawItems = (container.items as AnyMap[]) ?? [];
  const total = container.totalCount ?? rawItems.length;

  const normalize =
    kind === "track"
      ? normalizeTrack
      : kind === "artist"
        ? normalizeArtist
        : kind === "album"
          ? normalizeAlbum
          : normalizePlaylistSimplified;

  const items = rawItems
    .map((wrapper) => {
      // Search items are wrapped: item.data or just data
      const data = wrapper?.item?.data ?? wrapper?.data ?? wrapper;
      if (!data?.uri && !data?.name) return null;
      return normalize(data);
    })
    .filter(Boolean);

  return {
    items,
    total,
    limit,
    offset,
    href: "",
    next: offset + limit < total ? "next" : null,
    previous: offset > 0 ? "prev" : null,
  };
}

/** Library items: data.me.libraryV3.items[].item.data */
export function extractLibraryItems(
  lib: AnyMap | null,
  kind: string,
): { items: AnyMap[]; total: number } {
  if (!lib) return { items: [], total: 0 };

  const rawItems = (lib.items as AnyMap[]) ?? [];
  const total = lib.totalCount ?? rawItems.length;
  const seen = new Set<string>();

  const normalize =
    kind === "track"
      ? normalizeTrack
      : kind === "artist"
        ? normalizeArtist
        : kind === "album"
          ? normalizeAlbum
          : normalizePlaylistSimplified;

  const items: AnyMap[] = [];
  for (const raw of rawItems) {
    const data = raw?.item?.data ?? raw?.data ?? raw;
    if (!data?.uri) continue;
    if (seen.has(data.uri)) continue;
    seen.add(data.uri);
    items.push(normalize(data));
  }

  return { items, total };
}

/** Playlist content: data.playlistV2.content.items[].itemV2.data */
export function extractPlaylistTracks(
  content: AnyMap | null,
): { items: AnyMap[]; total: number } {
  if (!content) return { items: [], total: 0 };

  const rawItems = (content.items as AnyMap[]) ?? [];
  const total = content.totalCount ?? rawItems.length;
  const seen = new Set<string>();

  const items: AnyMap[] = [];
  for (const raw of rawItems) {
    const data = raw?.itemV2?.data ?? raw?.item?.data ?? raw?.data ?? raw;
    if (!data?.uri) continue;
    if (seen.has(data.uri)) continue;
    seen.add(data.uri);
    items.push({
      added_at: raw?.addedAt?.isoString ?? raw?.addedAt ?? "",
      added_by: { id: "", external_urls: { spotify: "" } },
      is_local: false,
      track: normalizeTrack(data),
    });
  }

  return { items, total };
}

/** Recursively collect items of a given kind from any depth. */
export function collectItemsByKind(
  value: unknown,
  kind: string,
): AnyMap[] {
  const items: AnyMap[] = [];
  visitItems(value, kind, items);
  return items;
}

function visitItems(value: unknown, kind: string, items: AnyMap[]): void {
  if (Array.isArray(value)) {
    for (const child of value) visitItems(child, kind, items);
    return;
  }
  if (value == null || typeof value !== "object") return;
  const m = value as AnyMap;

  // Check if this node is an item of the right kind
  const uri = m.uri ?? "";
  if (typeof uri === "string" && uri.includes(`spotify:${kind}:`)) {
    const normalize =
      kind === "track"
        ? normalizeTrack
        : kind === "artist"
          ? normalizeArtist
          : kind === "album"
            ? normalizeAlbum
            : normalizePlaylistSimplified;
    items.push(normalize(m));
  }

  // Recurse into children
  for (const child of Object.values(m)) {
    if (child && typeof child === "object") {
      visitItems(child, kind, items);
    }
  }
}

/** Extract home feed sections with their items. */
export function extractHomeSections(
  payload: AnyMap,
): { title: string; items: AnyMap[] }[] {
  const sections: { title: string; items: AnyMap[] }[] = [];

  const sectionContainer =
    getNestedMap(payload, "data", "home", "sectionContainer") ??
    getNestedMap(payload, "data", "home");
  if (!sectionContainer) return sections;

  const sectionList =
    sectionContainer.sections?.items ?? sectionContainer.sections ?? [];
  if (!Array.isArray(sectionList)) return sections;

  for (const section of sectionList) {
    const title =
      section?.data?.title?.text ??
      section?.data?.title ??
      section?.title?.text ??
      section?.title ??
      "";
    const sectionItems = section?.sectionItems?.items ?? section?.items ?? [];
    if (!Array.isArray(sectionItems)) continue;

    const items: AnyMap[] = [];
    for (const si of sectionItems) {
      const data = si?.content?.data ?? si?.data ?? si;
      if (!data?.uri) continue;
      const uriType = typeFromUri(data.uri);
      if (uriType === "track") items.push(normalizeTrack(data));
      else if (uriType === "artist") items.push(normalizeArtist(data));
      else if (uriType === "album") items.push(normalizeAlbum(data));
      else if (uriType === "playlist")
        items.push(normalizePlaylistSimplified(data));
      else items.push(data);
    }

    if (title || items.length > 0) {
      sections.push({ title: typeof title === "string" ? title : "", items });
    }
  }

  return sections;
}
