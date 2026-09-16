const MAX_BODY = 18 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9_-]{32}$/;
const HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: HEADERS }); }
function text(value, max, required = false) {
  if (typeof value !== "string") value = "";
  value = value.trim();
  if (value.length > max || (required && !value)) throw new Error("Please check the length of your name or message.");
  return value;
}
function token() { return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
async function boundedBody(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY) throw new Error("These files are too large. Please choose smaller photos or audio.");
  const reader = request.body?.getReader(); if (!reader) throw new Error("Your surprise details are missing.");
  let size = 0; const chunks = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BODY) { await reader.cancel(); throw new Error("These files are too large. Please choose smaller photos or audio."); } chunks.push(value); }
  return new Blob(chunks);
}
async function saveSurprise(request, env) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Please create your surprise from this website." }, 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) return json({ error: "Please use the birthday form to create a link." }, 400);
  const id = token(), prefix = `surprises/${id}/`, keys = [];
  try {
    const body = await boundedBody(request);
    const form = await new Response(body, { headers: { "content-type": request.headers.get("content-type") } }).formData();
    const raw = form.get("details"); if (typeof raw !== "string" || raw.length > 24000) throw new Error("Your surprise details could not be read.");
    let data; try { data = JSON.parse(raw); } catch { throw new Error("Your surprise details could not be read."); }
    const details = {
      name: text(data.name, 60, true), sender: text(data.sender, 60, true), age: text(String(data.age ?? ""), 3),
      balloonMessages: Array.isArray(data.balloonMessages) ? data.balloonMessages.slice(0, 5).map(s => text(s, 200, true)) : [],
      letter: text(data.letter, 8000, true), finalMessage: text(data.finalMessage, 1000, true),
      soundtrackDefault: data.soundtrackDefault === "silent" ? "silent" : "local",
      music: "assets/music.mp3", memories: []
    };
    if (details.balloonMessages.length !== 5) throw new Error("Please fill all five balloon messages.");
    if (details.age && (!/^\d{1,3}$/.test(details.age) || Number(details.age) < 1 || Number(details.age) > 150)) throw new Error("Please use an age between 1 and 150, or leave it blank.");
    const photos = form.getAll("photos"); if (photos.length > 5) throw new Error("Choose up to five photos.");
    const writes = [];
    for (let index = 0; index < photos.length; index++) {
      const file = photos[index];
      if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024) throw new Error("Please use photos smaller than 2 MB after processing.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let type;
      if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) type = "image/jpeg";
      else if (bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) type = "image/png";
      else if (String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") type = "image/webp";
      else throw new Error("Please choose JPG, PNG, or WebP photos.");
      const key = `${prefix}photo-${index}`; keys.push(key); writes.push({ key, bytes, type });
      const caption = text(data.captions?.[index] || "A moment to keep", 120);
      details.memories.push({ image: `/api/surprises/${id}/photo-${index}`, caption, alt: caption || `Memory ${index + 1}` });
    }
    if (!photos.length) {
      const captions = ["Chasing the last light", "Beauty in the little things", "Slow mornings, warm hearts", "Taking the long way home", "Nights worth remembering"];
      details.memories = captions.map((caption, index) => ({ image: `assets/photo${index + 1}.jpg`, caption, alt: caption }));
    }
    const music = form.get("music");
    if (music) {
      if (!(music instanceof File) || !music.size || music.size > 8 * 1024 * 1024) throw new Error("Please choose an audio file smaller than 8 MB.");
      const types = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", ogg: "audio/ogg", aac: "audio/aac" };
      const extension = music.name.split(".").pop().toLowerCase(), type = types[extension];
      if (!type) throw new Error("Choose MP3, M4A, WAV, OGG, or AAC audio.");
      const key = `${prefix}music`; keys.push(key); writes.push({ key, bytes: await music.arrayBuffer(), type });
      details.music = `/api/surprises/${id}/music`;
    }
    const results = await Promise.allSettled(writes.map(file => env.BUCKET.put(file.key, file.bytes, { httpMetadata: { contentType: file.type } })));
    if (results.some(result => result.status === "rejected")) throw new Error("The photos couldn’t be saved just now. Your details are still here; please try again.");
    await env.BUCKET.put(`${prefix}details.json`, JSON.stringify({ ...details, createdAt: new Date().toISOString() }), { httpMetadata: { contentType: "application/json" } });
    return json({ id, path: `/?surprise=${id}` }, 201);
  } catch (error) {
    await Promise.allSettled(keys.map(key => env.BUCKET.delete(key)));
    const message = String(error.message || "");
    const known = /^(Please|Your|These|Choose|The photos)/.test(message);
    if (!known) console.error("Surprise save failed", error);
    return json({ error: known ? message : "Your surprise couldn’t be saved just now. Your details are still here; please try again." }, known ? 400 : 503);
  }
}
async function loadSurprise(id, env) {
  const object = await env.BUCKET.get(`surprises/${id}/details.json`);
  if (!object) return json({ error: "This surprise link wasn’t found. Please ask the sender to check the link." }, 404);
  return new Response(object.body, { headers: HEADERS });
}
async function media(request, env, id, name) {
  if (!/^(photo-[0-4]|music)$/.test(name)) return json({ error: "This keepsake wasn’t found." }, 404);
  const key = `surprises/${id}/${name}`;
  const range = request.headers.get("range");
  const object = await env.BUCKET.get(key, range ? { range: request.headers } : undefined);
  if (!object) return json({ error: "This keepsake wasn’t found." }, 404);
  const headers = new Headers({ "cache-control": "private, max-age=86400", "accept-ranges": "bytes", "x-content-type-options": "nosniff", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" });
  object.writeHttpMetadata(headers); headers.set("etag", object.httpEtag);
  if (object.range) { headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`); headers.set("content-length", String(object.range.length)); }
  else headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { status: object.range ? 206 : 200, headers });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      if (!env.BUCKET) return json({ error: "Sharing is unavailable just now. Your details are still here; please try again shortly." }, 503);
      try {
        if (url.pathname === "/api/surprises" && request.method === "POST") return await saveSurprise(request, env);
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "api" && parts[1] === "surprises" && ID_PATTERN.test(parts[2] || "") && ["GET", "HEAD"].includes(request.method)) {
          if (parts.length === 3) return await loadSurprise(parts[2], env);
          if (parts.length === 4) return await media(request, env, parts[2], parts[3]);
        }
        return json({ error: "This surprise link wasn’t found." }, 404);
      } catch (error) { console.error("Surprise load failed", error); return json({ error: "The surprise couldn’t load just now. Please try again in a moment." }, 503); }
    }
    return env.ASSETS.fetch(request);
  }
};
