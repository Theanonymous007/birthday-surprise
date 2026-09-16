/* GitHub Pages calls the public birthday function; credentials stay on Supabase. */
(() => {
  "use strict";
  function baseUrl() {
    const url = String(window.surpriseService?.projectUrl || "").replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error("The surprise service has not been connected yet.");
    return url + "/functions/v1/birthday-surprises";
  }
  async function call(path, options = {}) {
    let response;
    try { response = await fetch(baseUrl() + path, { ...options, cache: "no-store", credentials: "omit" }); }
    catch { throw new Error("The surprise service couldn’t be reached. Please try again in a moment."); }
    const data = await response.json().catch(() => null);
    if (response.status === 401) throw new Error("The surprise service isn’t ready for visitors yet. Its public-function setting needs to be enabled.");
    if (!response.ok) throw new Error(data?.error || "The surprise couldn’t be saved or opened. Please try again.");
    if (!data || typeof data !== "object") throw new Error("The surprise service returned an unexpected response.");
    return data;
  }
  window.birthdayBackend = {
    async create(form) {
      const result = await call("/api/surprises", { method: "POST", body: form });
      if (!/^[A-Za-z0-9_-]{32}$/.test(result.id || "")) throw new Error("The surprise link couldn’t be created. Please try again.");
      return result;
    },
    async load(id) {
      if (!/^[A-Za-z0-9_-]{32}$/.test(id || "")) throw new Error("This surprise link doesn’t look complete. Ask the sender to send it again.");
      const data = await call("/api/surprises/" + id);
      const mediaUrl = path => typeof path === "string" && path.startsWith("/api/surprises/" + id + "/") ? baseUrl() + path : path;
      data.memories = (Array.isArray(data.memories) ? data.memories : []).map(memory => ({ ...memory, image: mediaUrl(memory.image) }));
      data.music = mediaUrl(data.music);
      return data;
    }
  };
})();
