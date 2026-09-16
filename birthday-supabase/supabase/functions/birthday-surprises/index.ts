// Paste this whole file into a Supabase Edge Function named birthday-surprises.
// Its private bucket must be named birthday-surprises.
// Public visitors use random surprise links; no admin key belongs in the website.

const BUCKET = "birthday-surprises";
const MAX_BODY = 18 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, range",
  "access-control-expose-headers": "content-type, content-length, location",
  "access-control-max-age": "86400",
};
const JSON_HEADERS = {
  ...CORS, "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store", "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer",
};
class RequestError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}
function text(value: unknown, max: number, required = false): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max || (required && !result)) throw new RequestError("Please check the length of your name or message.");
  return result;
}
function randomId(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function boundedBody(request: Request): Promise<Blob> {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new RequestError("These files are too large. Please use smaller photos or audio.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("Your surprise details are missing.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new RequestError("These files are too large. Please use smaller photos or audio.", 413); }
    chunks.push(value);
  }
  return new Blob(chunks);
}

// All credentials are read from Supabase's SERVER environment, never the visitor.
function storageClient() {
  const projectUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  let secret = "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const candidate = keys?.default || Object.values(keys || {})[0];
    if (typeof candidate === "string") secret = candidate;
  } catch { /* Older projects use the built-in legacy key below. */ }
  secret ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!projectUrl || !secret) throw new RequestError("The upload service needs its Supabase server configuration.", 503);
  const base = projectUrl + "/storage/v1";
  const auth: Record<string, string> = { apikey: secret };
  if (!secret.startsWith("sb_secret_")) auth.authorization = "Bearer " + secret;
  const objectPath = (key: string) => BUCKET + "/" + key.split("/").map(encodeURIComponent).join("/");
  async function request(path: string, init: RequestInit = {}): Promise<Response> {
    return await fetch(base + path, { ...init, headers: { ...auth, ...Object.fromEntries(new Headers(init.headers)) } });
  }
  async function missing(response: Response): Promise<boolean> {
    if (response.status === 404) return true;
    if (response.status !== 400) return false;
    const result = await response.clone().json().catch(() => ({}));
    return result.statusCode === "404" || /not found|does not exist/i.test(String(result.message || result.error || ""));
  }
  return {
    async check() {
      const response = await request("/bucket/" + BUCKET);
      if (!response.ok) { await response.body?.cancel(); throw new RequestError("Create the birthday-surprises storage bucket in this Supabase project first.", 503); }
      const bucket = await response.json();
      if (bucket.public !== false) throw new RequestError("Set the birthday-surprises bucket to private before saving photos.", 503);
    },
    async put(key: string, body: BodyInit, contentType: string) {
      const response = await request("/object/" + objectPath(key), { method: "POST", body, headers: { "content-type": contentType, "x-upsert": "false" } });
      if (!response.ok) { await response.body?.cancel(); throw new RequestError("The upload couldn’t be saved. Check the bucket settings and storage allowance, then try again.", 503); }
      await response.body?.cancel();
    },
    async get(key: string): Promise<Response | null> {
      const response = await request("/object/authenticated/" + objectPath(key));
      if (await missing(response)) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new RequestError("The surprise couldn’t load just now. Please try again.", 503); }
      return response;
    },
    async remove(keys: string[]) {
      if (!keys.length) return;
      const response = await request("/object/" + BUCKET, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ prefixes: keys }) });
      await response.body?.cancel();
      if (!response.ok) console.warn("Some incomplete surprise uploads could not be removed.");
    },
    async signedUrl(key: string): Promise<string | null> {
      const response = await request("/object/sign/" + objectPath(key), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
      if (await missing(response)) { await response.body?.cancel(); return null; }
      if (!response.ok) { await response.body?.cancel(); throw new RequestError("This memory couldn’t load just now. Please try again.", 503); }
      const result = await response.json();
      if (typeof result.signedURL !== "string" || !result.signedURL.startsWith("/object/sign/")) throw new RequestError("This memory couldn’t load just now. Please try again.", 503);
      return base + result.signedURL;
    },
  };
}
type Store = ReturnType<typeof storageClient>;
type Memory = { image: string; caption: string; alt: string };

async function saveSurprise(request: Request, storage: Store): Promise<Response> {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new RequestError("Please use the birthday form to create a link.");
  const body = await boundedBody(request);
  let form: FormData;
  try { form = await new Response(body, { headers: { "content-type": request.headers.get("content-type")! } }).formData(); }
  catch { throw new RequestError("Your upload could not be read. Please try the birthday form again."); }
  const raw = form.get("details");
  if (typeof raw !== "string" || raw.length > 24000) throw new RequestError("Your surprise details could not be read.");
  let data: Record<string, unknown>;
  try { data = JSON.parse(raw); } catch { throw new RequestError("Your surprise details could not be read."); }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new RequestError("Your surprise details could not be read.");
  const details = {
    name: text(data.name, 60, true), sender: text(data.sender, 60, true), age: text(String(data.age ?? ""), 3),
    balloonMessages: Array.isArray(data.balloonMessages) ? data.balloonMessages.map(item => text(item, 200, true)) : [],
    letter: text(data.letter, 8000, true), finalMessage: text(data.finalMessage, 1000, true),
    soundtrackDefault: data.soundtrackDefault === "silent" ? "silent" : "local", music: "assets/music.mp3",
    memories: [] as Memory[], createdAt: new Date().toISOString(),
  };
  if (details.balloonMessages.length !== 5) throw new RequestError("Please fill all five balloon messages.");
  if (details.age && (!/^\d{1,3}$/.test(details.age) || +details.age < 1 || +details.age > 150)) throw new RequestError("Please enter an age from 1 to 150, or leave it blank.");
  const photos = form.getAll("photos");
  if (photos.length > 5) throw new RequestError("Choose up to five photos.");
  const captions = Array.isArray(data.captions) ? data.captions : [];
  const id = randomId(), prefix = `surprises/${id}/`;
  const writes: { key: string; body: BodyInit; type: string }[] = [];
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index];
    if (!(photo instanceof File) || photo.size === 0 || photo.size > 2 * 1024 * 1024) throw new RequestError("Please use photos smaller than 2 MB after processing.");
    const bytes = new Uint8Array(await photo.arrayBuffer());
    let type = "";
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) type = "image/jpeg";
    else if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) type = "image/png";
    else if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") type = "image/webp";
    else throw new RequestError("Please choose JPG, PNG, or WebP photos.");
    const caption = text(captions[index] || "A moment to keep", 120);
    writes.push({ key: prefix + `photo-${index}`, body: photo, type });
    details.memories.push({ image: `/api/surprises/${id}/photo-${index}`, caption, alt: caption });
  }
  if (!photos.length) {
    const captions = ["Chasing the last light", "Beauty in the little things", "Slow mornings, warm hearts", "Taking the long way home", "Nights worth remembering"];
    details.memories = captions.map((caption, index) => ({ image: `assets/photo${index + 1}.jpg`, caption, alt: caption }));
  }
  const music = form.get("music");
  if (music) {
    if (!(music instanceof File) || !music.size || music.size > 8 * 1024 * 1024) throw new RequestError("Choose an audio file under 8 MB.");
    const types: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac" };
    const type = types[music.name.split(".").pop()?.toLowerCase() || ""];
    if (!type) throw new RequestError("Choose MP3, M4A, WAV, OGG, or AAC audio.");
    writes.push({ key: prefix + "music", body: music, type });
    details.music = `/api/surprises/${id}/music`;
  }
  await storage.check();
  const keys = writes.map(file => file.key);
  try {
    const uploads = await Promise.allSettled(writes.map(file => storage.put(file.key, file.body, file.type)));
    const failed = uploads.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    keys.push(prefix + "details.json");
    await storage.put(prefix + "details.json", JSON.stringify(details), "application/json");
    return json({ id }, 201);
  } catch (error) { await storage.remove(keys).catch(() => {}); throw error; }
}

async function handle(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const pathname = new URL(request.url).pathname;
  const marker = "/birthday-surprises", index = pathname.indexOf(marker);
  const route = index < 0 ? pathname : pathname.slice(index + marker.length);
  try {
    const storage = storageClient();
    if ((!route || route === "/") && request.method === "GET") {
      await storage.check();
      return json({ ok: true, service: "birthday-surprises", storage: "ready" });
    }
    if (route === "/api/surprises" && request.method === "POST") return await saveSurprise(request, storage);
    const parts = route.split("/").filter(Boolean);
    if (parts[0] === "api" && parts[1] === "surprises" && ID_PATTERN.test(parts[2] || "") && ["GET", "HEAD"].includes(request.method)) {
      const prefix = `surprises/${parts[2]}/`;
      if (parts.length === 3) {
        const object = await storage.get(prefix + "details.json");
        if (!object) return json({ error: "This surprise link wasn’t found. Ask the sender to check the link." }, 404);
        if (request.method === "HEAD") await object.body?.cancel();
        return new Response(request.method === "HEAD" ? null : object.body, { headers: JSON_HEADERS });
      }
      if (parts.length === 4 && /^(photo-[0-4]|music)$/.test(parts[3])) {
        const signedUrl = await storage.signedUrl(prefix + parts[3]);
        if (!signedUrl) return json({ error: "This memory wasn’t found." }, 404);
        // The browser receives a temporary URL for this one file, never an admin credential.
        return new Response(null, { status: 302, headers: { ...CORS, location: signedUrl, "cache-control": "no-store", "referrer-policy": "no-referrer", "x-robots-tag": "noindex, nofollow" } });
      }
    }
    return json({ error: "This surprise link wasn’t found." }, 404);
  } catch (error) {
    if (error instanceof RequestError) return json({ error: error.message }, error.status);
    console.error("Birthday service request failed.");
    return json({ error: "The surprise service couldn’t finish this request. Please try again in a moment." }, 503);
  }
}
Deno.serve(handle);
