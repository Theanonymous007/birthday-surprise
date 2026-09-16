/* Creator form and durable surprise links. Personal copy lives in birthdayConfig. */
(() => {
  "use strict";
  const $ = selector => document.querySelector(selector);
  const photoDrafts = [];
  const defaultMemories = birthdayConfig.memories.map(memory => ({ ...memory }));
  let busy = false, processingPhotos = false;
  const surpriseId = new URLSearchParams(location.search).get("surprise");
  const defaultSender = birthdayConfig.sender;
  $("#letter-editor").value = birthdayConfig.letter;
  $("#final-message-editor").value = birthdayConfig.finalMessage;
  birthdayConfig.balloonMessages.forEach((message, index) => {
    const label = document.createElement("label"); label.htmlFor = `balloon-text-${index}`; label.textContent = `Little reminder ${index + 1}`;
    const input = document.createElement("textarea"); input.id = label.htmlFor; input.rows = 2; input.maxLength = 200; input.required = true; input.value = message;
    $("#balloon-editor").append(label, input);
  });
  function collectDetails() {
    return {
      name: $("#recipient-name").value.trim(), sender: $("#sender-name").value.trim() || defaultSender, age: $("#birthday-age").value,
      balloonMessages: Array.from({length:5}, (_, index) => $(`#balloon-text-${index}`).value.trim()),
      letter: $("#letter-editor").value.trim(), finalMessage: $("#final-message-editor").value.trim(),
      soundtrackDefault: $("#soundtrack-source").value === "silent" ? "silent" : "local",
      captions: photoDrafts.map(photo => photo.caption || "A moment to keep")
    };
  }
  function syncDraft() {
    const details = collectDetails();
    Object.assign(birthdayConfig, details, { memories: photoDrafts.length ? photoDrafts.map(photo => ({ image: photo.url, caption: photo.caption || "A moment to keep", alt: photo.caption || "A favourite memory" })) : defaultMemories });
    return details;
  }
  $("#welcome-form").addEventListener("submit", event => {
    syncDraft();
    if (processingPhotos) { event.preventDefault(); event.stopImmediatePropagation(); $("#save-status").textContent = "Your photos are still getting ready. Just a moment…"; return; }
    if (event.submitter?.id === "create-surprise") { event.preventDefault(); event.stopImmediatePropagation(); saveSurprise(); }
  }, true);
  // Open a collapsed editor when native form validation needs one of its fields.
  $("#welcome-form").addEventListener("invalid", event => { const panel = event.target.closest("details"); if (panel) panel.open = true; }, true);
  function renderPhotos() {
    $("#photo-editor").replaceChildren();
    photoDrafts.forEach((photo, index) => {
      const card = document.createElement("div"); card.className = "photo-draft";
      const img = document.createElement("img"); img.src = photo.url; img.alt = `Selected memory ${index + 1}`;
      const caption = document.createElement("input"); caption.type = "text"; caption.maxLength = 120; caption.placeholder = "A little caption…"; caption.value = photo.caption;
      caption.setAttribute("aria-label", `Caption for photo ${index + 1}`); caption.addEventListener("input", () => { photo.caption = caption.value; });
      const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×"; remove.setAttribute("aria-label", `Remove photo ${index + 1}`);
      remove.addEventListener("click", () => { URL.revokeObjectURL(photo.url); photoDrafts.splice(index, 1); renderPhotos(); });
      card.append(img, caption, remove); $("#photo-editor").append(card);
    });
    $("#photos-status").textContent = photoDrafts.length ? `${photoDrafts.length} of 5 memories ready. Add a caption beneath each photo.` : "No photos yet. The preview uses sample scenery until you add yours.";
  }
  async function preparePhoto(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024) throw new Error("Choose JPG, PNG or WebP photos under 10 MB each.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url;
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("One photo could not be opened. Try exporting it as a JPG.")); });
      const ratio = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.naturalWidth*ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight*ratio));
      const context = canvas.getContext("2d"); context.fillStyle = "#f5e8da"; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve,"image/jpeg",.86));
      if (!blob) throw new Error("One photo could not be prepared. Try another JPG.");
      return { blob, url: URL.createObjectURL(blob), caption: "" };
    } finally { URL.revokeObjectURL(url); }
  }
  $("#memory-files").addEventListener("change", async event => {
    if (processingPhotos) return;
    const files = [...event.target.files]; if (!files.length) return;
    if (files.length + photoDrafts.length > 5) { $("#photos-status").textContent = "There’s room for five photos. Remove one before adding more."; event.target.value = ""; return; }
    processingPhotos = true; event.target.disabled = true; $("#photos-status").textContent = "Getting your memories ready…";
    try { for (const file of files) photoDrafts.push(await preparePhoto(file)); renderPhotos(); }
    catch (error) { renderPhotos(); $("#photos-status").textContent = error.message; }
    finally { processingPhotos = false; event.target.disabled = false; event.target.value = ""; }
  });
  async function saveSurprise() {
    if (busy || processingPhotos) return { error: "Your surprise is still being prepared. Please wait a moment." };
    if (!$("#welcome-form").reportValidity()) return { error: "Please complete the highlighted fields." };
    busy = true; const button = $("#create-surprise"); button.disabled = true;
    $("#save-status").textContent = "Saving your words and memories…";
    try {
      const details = syncDraft();
      const form = new FormData(); form.append("details", JSON.stringify(details));
      photoDrafts.forEach((photo,index) => form.append("photos", photo.blob, `memory-${index+1}.jpg`));
      if ($("#soundtrack-source").value === "file") {
        const music = $("#audio-file").files[0];
        if (!music) throw new Error("Please choose the audio file again before creating the link.");
        if (music.size > 8*1024*1024) throw new Error("For sharing, choose an audio file under 8 MB.");
        form.append("music", music);
      }
      const response = await fetch("/api/surprises", { method:"POST", body:form });
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Link creation needs the hosted website. Your preview and details are still here.");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The surprise couldn’t be saved. Please try again.");
      const link = new URL(result.path, location.origin).href;
      window.birthdayJourney.pause(); $("#welcome").hidden = true; $("#site-shell").hidden = true; $("#share-result").hidden = false;
      $("#surprise-link").value = link; $("#open-surprise-link").href = link;
      $("#share-description").textContent = `${details.name} will open a birthday journey made just for them. Your words, photos, and music are ready.`;
      $("#save-status").textContent = ""; $("#copy-status").textContent = ""; window.scrollTo(0,0);
      $("#share-title").tabIndex = -1; $("#share-title").focus({preventScroll:true});
      return { url: link, status: "created" };
    } catch (error) { $("#save-status").textContent = error.message || "We couldn’t save the surprise. Please try again; your details are still here."; return { error: $("#save-status").textContent }; }
    finally { busy = false; button.disabled = false; }
  }
  $("#final-create-link").addEventListener("click", () => { $("#site-shell").hidden = true; $("#welcome").hidden = false; window.scrollTo(0,0); saveSurprise(); });
  $("#copy-link").addEventListener("click", async () => {
    const link = $("#surprise-link").value;
    try { await navigator.clipboard.writeText(link); $("#copy-status").textContent = "Copied. Send a little happiness."; }
    catch { $("#surprise-link").focus(); $("#surprise-link").select(); $("#copy-status").textContent = "The link is selected. Copy it from this field and send it to them."; }
  });
  if (navigator.share) { $("#native-share").hidden = false; $("#native-share").addEventListener("click", async () => { try { await navigator.share({title:"A little birthday surprise",text:"A little something, just for you.",url:$("#surprise-link").value}); } catch(error) { if (error.name !== "AbortError") $("#copy-status").textContent = "Use Copy surprise link to share it."; } }); }
  $("#edit-another").addEventListener("click", () => { $("#share-result").hidden = true; $("#welcome").hidden = false; window.scrollTo(0,0); $("#recipient-name").focus({preventScroll:true}); });
  async function loadGift() {
    $("#welcome").hidden = true; $("#gift-loading").hidden = false; $("#retry-gift").hidden = true;
    $("#gift-load-message").textContent = "Gathering a little magic for you…";
    try {
      if (!/^[A-Za-z0-9_-]{32}$/.test(surpriseId || "")) throw new Error("This surprise link doesn’t look complete. Ask the sender to send it again.");
      const response = await fetch(`/api/surprises/${surpriseId}`); const details = await response.json();
      if (!response.ok) throw new Error(details.error || "This surprise couldn’t be opened just now.");
      window.birthdayJourney.configure(details);
      $("#gift-name").textContent = `Just for ${details.name}.`;
      $("#gift-from").textContent = `A birthday surprise, with love from ${details.sender}.`;
      $("#gift-loading").hidden = true; $("#gift-intro").hidden = false;
      $("#edit-details").hidden = true; $("#final-create-link").hidden = true;
    } catch(error) { $("#gift-load-message").textContent = error.message || "Your surprise couldn’t load. Please try again."; $("#retry-gift").hidden = false; }
  }
  $("#retry-gift").addEventListener("click", loadGift);
  $("#open-gift").addEventListener("click", () => window.birthdayJourney.openGift());
  if (surpriseId !== null) loadGift();
  // Optional browser integration uses the same draft and save action as the form.
  if (surpriseId === null && document.modelContext?.registerTool) {
    const lifecycle = new AbortController();
    const definitions = [
      { name: "get_birthday_draft", title: "Read birthday draft", description: "Read the birthday details currently entered in the creator form; does not save or share anything.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { if (!input || Object.keys(input).length) return { error: "This action takes no fields." }; return { ...collectDetails(), photoCount: photoDrafts.length, preparingPhotos: processingPhotos }; } },
      { name: "create_birthday_surprise_link", title: "Create surprise link", description: "Save the currently entered birthday details and selected photos and audio, then display a new shareable recipient URL. Anyone with that URL can open the surprise. Does not send the link to anyone.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, async execute(input) { if (!input || Object.keys(input).length) return { error: "This action takes no fields. Fill the birthday form first." }; return await saveSurprise(); } }
    ];
    for (const definition of definitions) {
      try { Promise.resolve(document.modelContext.registerTool(definition, { signal: lifecycle.signal })).catch(() => {}); } catch { /* The normal creator form remains available. */ }
    }
    window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  }
})();
