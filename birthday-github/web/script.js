/* ======================================================================
   YOUR BIRTHDAY, YOUR WORDS — EDIT ALL PERSONAL CONTENT HERE.
   The welcome screen asks for the recipient's name on every fresh visit.
   A name here pre-fills that field. Age is optional. Plain text only.
   Replace assets/photo1.jpg ... photo5.jpg with your own photos.
   Replace assets/music.mp3 with an audio file you have permission to use.
   The music.mp3 is the user-supplied blue karaoke/instrumental audio.
   ====================================================================== */
const birthdayConfig = {
  name: "",
  age: "",
  sender: "Someone who’s very glad you exist",
  introMessage: "This little universe was waiting for you, {name}.",
  balloonMessages: [
    "You turn ordinary days into the ones I want to remember.",
    "Your laugh is one of my favourite sounds in the world.",
    "You make room for kindness, even in the smallest moments.",
    "Life feels a little more like an adventure with you in it.",
    "You deserve every beautiful thing coming your way."
  ],
  balloonFinalMessage: "Five little reminders. A thousand more reasons. You are so loved, {name}.",
  // Between 0 and 5 memories. Empty lists show a graceful keepsake card.
  // Bundled stock photos are illustrative samples, not personal memories.
  memories: [
    { image: "assets/photo1.jpg", caption: "Chasing the last light", alt: "Peach-pink sunset above gentle ocean waves" },
    { image: "assets/photo2.jpg", caption: "Beauty in the little things", alt: "A soft pink peony against a dark background" },
    { image: "assets/photo3.jpg", caption: "Slow mornings, warm hearts", alt: "Two coffee cups beside a sunlit café window" },
    { image: "assets/photo4.jpg", caption: "Taking the long way home", alt: "A winding road through mountains at dusk" },
    { image: "assets/photo5.jpg", caption: "Nights worth remembering", alt: "Golden lights reflected beneath a Roman bridge" }
  ],
  letterGreeting: "Dear {name},",
  letter: `If I could wrap up a feeling and give it to you today, it would be this: the world is a warmer, brighter place because you’re in it.

I hope this year brings you the kind of happiness that finds you in ordinary moments. The laugh you can’t hold in. The song that plays at exactly the right time. The quiet certainty that you are loved, just as you are.

Keep making wishes. Keep being wonderfully yourself. There are so many beautiful things still waiting to happen, and I hope you let yourself enjoy every one of them.

Here’s to your next chapter, and to all the little moments that will make it yours.`,
  letterSignoff: "With so much love,",
  finalMessage: "May your days be gentle, your dreams be bold, and your heart always have a reason to dance. Here’s to another beautiful trip around the sun.",
  finalFrom: "With love, {sender}",
  music: "assets/music.mp3",
  musicVolume: 0.32,
  soundtrackDefault: "local", // local | silent
  musicTitle: "blue · yung kai (karaoke instrumental)"
};
/* END OF CUSTOMIZATION — no personal content needs editing below here. */

(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  const chapters = ["Star", "Cake", "Balloons", "Memories", "Letter", "Surprise"];
  const chapterIcons = ["star", "cake", "balloon", "photo", "letter", "heart"];
  const state = { stage: 0, maxStage: 0, star: false, candles: new Set(), balloons: new Set(), memory: 0, letter: false, transitioning: false, started: false };
  const recipientMode = new URLSearchParams(location.search).has("surprise");
  const audio = $("#birthday-music");
  let soundMode = birthdayConfig.soundtrackDefault;
  let soundWanted = false;
  let audioContext, uploadedAudioUrl, soundGeneration = 0;
  let micStream, micTimer, micFrame, micSource, micRequest = 0, micActive = false;
  let transitionTimer, envelopeTimer;
  const format = value => String(value ?? "").replace(/\{name\}/g, () => birthdayConfig.name).replace(/\{sender\}/g, () => birthdayConfig.sender).replace(/\{age\}/g, () => String(birthdayConfig.age));
  const icon = name => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const announce = text => { $("#audio-status").textContent = text; };
  const setSoundUI = playing => {
    $("#music-toggle").setAttribute("aria-pressed", String(playing));
    $("#music-toggle").setAttribute("aria-label", playing ? "Pause music" : "Play music");
    $("#music-label").textContent = playing ? "Sound on" : "Sound off";
    $("#music-toggle use").setAttribute("href", playing ? "#i-sound" : "#i-mute");
  };

  function makeStars() {
    let seed = 6421;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 88; i++) {
      const star = document.createElement("i");
      const cross = i % 13 === 0;
      star.className = `sky-star${cross ? " cross" : ""}`;
      const size = cross ? 9 + random() * 5 : 1 + random() * 1.7;
      star.style.cssText = `left:${random() * 100}%;top:${random() * 100}%;width:${size}px;height:${size}px;--duration:${3 + random() * 6}s;--delay:${-random() * 9}s`;
      fragment.append(star);
    }
    $("#stars").append(fragment);
  }

  // Canvas effects run only during a burst, cap particle count, and stop offscreen.
  const canvas = $("#celebration");
  const ctx = canvas.getContext("2d");
  let particles = [], particleFrame = 0, lastFrame = 0, viewportW = 0, viewportH = 0;
  function resizeCanvas() {
    viewportW = window.innerWidth; viewportH = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewportW * ratio); canvas.height = Math.round(viewportH * ratio);
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function burst(x, y, count = 38, full = false) {
    if (!ctx || motionPreference.matches || document.hidden) return;
    const colors = ["#e9c893", "#e9b6c7", "#b5a4cf", "#faf0d5", "#c97b98"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = full ? 1 + Math.random() * 3 : 1 + Math.random() * 4;
      particles.push({ x: full ? Math.random() * viewportW : x, y: full ? -30 - Math.random() * viewportH * .4 : y,
        vx: full ? (Math.random() - .5) * 2 : Math.cos(angle) * velocity,
        vy: full ? 1 + Math.random() * 2 : Math.sin(angle) * velocity - 1.7,
        age: 0, life: full ? 280 + Math.random() * 110 : 70 + Math.random() * 30,
        size: full ? 3 + Math.random() * 4 : 1 + Math.random() * 3,
        color: colors[i % colors.length], rotation: Math.random() * 6.28, spin: (Math.random() - .5) * .12, full, heart: full && i % 8 === 0 });
    }
    particles = particles.slice(-240);
    if (!particleFrame) { lastFrame = performance.now(); particleFrame = requestAnimationFrame(drawParticles); }
  }
  function drawParticles(now) {
    if (document.hidden || motionPreference.matches) { clearParticles(); return; }
    const delta = Math.min((now - lastFrame) / 16.67, 2); lastFrame = now;
    ctx.clearRect(0, 0, viewportW, viewportH);
    particles = particles.filter(p => p.age < p.life && p.y < viewportH + 30);
    for (const p of particles) {
      p.age += delta; p.x += p.vx * delta; p.y += p.vy * delta; p.vy += (p.full ? .008 : .035) * delta; p.rotation += p.spin * delta;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation); ctx.globalAlpha = Math.min(1, (p.life - p.age) / 35); ctx.fillStyle = p.color;
      if (p.heart) { const s = p.size / 5; ctx.scale(s, s); ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-12, -5, -3, -12, 0, -6); ctx.bezierCurveTo(3, -12, 12, -5, 0, 3); ctx.fill(); }
      else if (p.full) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .55);
      else { ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.29); ctx.fill(); }
      ctx.restore();
    }
    particleFrame = particles.length ? requestAnimationFrame(drawParticles) : 0;
  }
  function clearParticles() { cancelAnimationFrame(particleFrame); particleFrame = 0; particles = []; if (ctx) ctx.clearRect(0, 0, viewportW, viewportH); }
  function burstAt(element, count = 40) { const rect = element.getBoundingClientRect(); burst(rect.left + rect.width / 2, rect.top + rect.height / 3, count); }

  function getAudioContext() {
    try { const AudioCtx = window.AudioContext || window.webkitAudioContext; if (!AudioCtx) return null; audioContext ||= new AudioCtx(); if (audioContext.state === "suspended") audioContext.resume().catch(() => {}); return audioContext; } catch { return null; }
  }
  function popSound() {
    if (!soundWanted) return;
    const ac = getAudioContext(); if (!ac) return;
    const oscillator = ac.createOscillator(), gain = ac.createGain(), now = ac.currentTime;
    oscillator.type = "sine"; oscillator.frequency.setValueAtTime(410, now); oscillator.frequency.exponentialRampToValueAtTime(80, now + .1);
    gain.gain.setValueAtTime(.08, now); gain.gain.exponentialRampToValueAtTime(.001, now + .13);
    oscillator.connect(gain); gain.connect(ac.destination); oscillator.start(now); oscillator.stop(now + .14);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }
  async function playMusic() {
    if (soundMode === "silent") soundMode = "local";
    soundWanted = true;
    const generation = ++soundGeneration;
    try { await audio.play(); if (generation !== soundGeneration || !soundWanted) { audio.pause(); return; } setSoundUI(true); }
    catch { if (generation === soundGeneration) { soundWanted = false; setSoundUI(false); announce("Music could not start. Tap the sound control to try again, or choose another audio file on the welcome screen."); } }
  }
  function pauseMusic() { soundWanted = false; soundGeneration++; audio.pause(); setSoundUI(false); }
  $("#music-toggle").addEventListener("click", () => { getAudioContext(); if ($("#music-toggle").getAttribute("aria-pressed") === "true") pauseMusic(true); else playMusic(); });
  audio.addEventListener("error", () => { if (soundWanted) { soundWanted = false; setSoundUI(false); announce("This audio file could not be played. Choose another audio file on the welcome screen."); } });
  audio.addEventListener("playing", () => setSoundUI(true));
  audio.addEventListener("pause", () => setSoundUI(false));
  audio.src = birthdayConfig.music; audio.volume = Math.max(0, Math.min(1, Number(birthdayConfig.musicVolume) || .32));

  function hydrateContent() {
    $("#letter-greeting").textContent = format(birthdayConfig.letterGreeting);
    $("#letter-body").replaceChildren();
    String(birthdayConfig.letter || "").split(/\n\s*\n/).filter(Boolean).forEach((paragraph, index) => { const p = document.createElement("p"); p.textContent = format(paragraph); p.style.setProperty("--paragraph-delay", `${Math.min(index * .12, 1)}s`); $("#letter-body").append(p); });
    $("#letter-signoff").textContent = format(birthdayConfig.letterSignoff);
    $("#letter-sender").textContent = birthdayConfig.sender;
    $("#final-name").textContent = birthdayConfig.name;
    const age = String(birthdayConfig.age ?? "").trim(); $("#age-badge").hidden = !age; $("#age-badge").textContent = `${age} beautiful trips around the sun`;
    $("#final-message").textContent = format(birthdayConfig.finalMessage);
    $("#final-from").textContent = format(birthdayConfig.finalFrom);
    document.title = `For ${birthdayConfig.name} · A Little Universe`;
    renderGallery();
    if (state.star) $("#star-message").textContent = format(birthdayConfig.introMessage);
    if (state.balloons.size === 5) $("#balloon-message").textContent = format(birthdayConfig.balloonFinalMessage);
  }

  $("#recipient-name").value = birthdayConfig.name;
  $("#birthday-age").value = birthdayConfig.age;
  $("#soundtrack-source").value = birthdayConfig.soundtrackDefault;
  $("#soundtrack-source option[value=local]").textContent = birthdayConfig.musicTitle;
  function updateSoundtrackChoice() {
    const mode = $("#soundtrack-source").value;
    $("#audio-upload-wrap").hidden = mode !== "file";
    $("#audio-file").required = mode === "file" && !uploadedAudioUrl;
    $("#music-explanation").textContent = mode === "file" ? "Your audio is included when you create a surprise link. Up to 8 MB." : mode === "local" ? "Your soundtrack begins with the first little moment." : "All the magic, in a little quiet.";
  }
  $("#soundtrack-source").addEventListener("change", updateSoundtrackChoice);
  $("#audio-file").addEventListener("change", () => {
    const file = $("#audio-file").files[0];
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(file.name)) { $("#audio-file").value = ""; $("#file-status").textContent = "Please choose an audio file."; return; }
    if (uploadedAudioUrl) URL.revokeObjectURL(uploadedAudioUrl);
    uploadedAudioUrl = URL.createObjectURL(file); $("#file-status").textContent = `Ready: ${file.name}`;
    updateSoundtrackChoice();
  });
  $("#welcome-form").addEventListener("submit", event => {
    event.preventDefault();
    if (event.submitter?.id === "create-surprise") return;
    const name = $("#recipient-name").value.trim();
    if (!name) { $("#recipient-name").setCustomValidity("A little name is all we need to begin."); $("#recipient-name").reportValidity(); return; }
    birthdayConfig.name = name; birthdayConfig.sender = $("#sender-name").value.trim() || birthdayConfig.sender; birthdayConfig.age = $("#birthday-age").value;
    hydrateContent(); makeBalloons();
    soundMode = $("#soundtrack-source").value;
    if (soundMode === "file" && !uploadedAudioUrl) { $("#file-status").textContent = "Choose a file before we begin."; return; }
    audio.src = soundMode === "file" ? uploadedAudioUrl : birthdayConfig.music;
    $("#welcome").hidden = true; $("#site-shell").hidden = false; state.started = true;
    renderNavigation(); window.scrollTo(0, 0); $(`#title-${state.stage}`).focus({ preventScroll: true });
    getAudioContext(); if (soundMode !== "silent") playMusic();
    history.replaceState({ chapter: state.stage }, "", `#${chapters[state.stage].toLowerCase()}`);
  });
  $("#edit-details").addEventListener("click", () => {
    stopMic(); pauseMusic(true); $("#site-shell").hidden = true; $("#welcome").hidden = false;
    $("#preview-surprise").innerHTML = `Return to preview ${icon("arrow")}`;
    window.scrollTo(0, 0); $("#recipient-name").focus({ preventScroll: true });
  });
  $("#recipient-name").addEventListener("input", () => $("#recipient-name").setCustomValidity(""));
  updateSoundtrackChoice();

  function renderNavigation() {
    $$("#chapter-list button").forEach((button, index) => {
      button.disabled = index > state.maxStage;
      if (index === state.stage) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
      button.setAttribute("aria-label", `${chapters[index]}, chapter ${index + 1} of 6${index > state.maxStage ? ", complete the previous chapter first" : ""}`);
    });
    $("#back-button").hidden = state.stage === 0;
    $("#footer-caption").hidden = state.stage !== 0;
    $("#chapter-count").innerHTML = `<b>0${state.stage + 1}</b> / 06`;
    $("#chapter-count").setAttribute("aria-label", `Chapter ${state.stage + 1} of 6`);
    document.body.classList.toggle("is-finale", state.stage === 5);
  }
  function stageComplete() { return [state.star, state.candles.size === 5, state.balloons.size === 5, true, state.letter, true][state.stage]; }
  function goToStage(index, pushHistory = true) {
    if (state.transitioning && !pushHistory) {
      clearTimeout(transitionTimer); $$(".stage").forEach(stage => stage.classList.remove("stage-leaving")); state.transitioning = false;
    }
    if (state.transitioning || index === state.stage || index < 0 || index > 5) return;
    if (index > state.maxStage && !(index === state.stage + 1 && stageComplete())) return;
    stopMic(); state.transitioning = true;
    const oldStage = $(`#stage-${state.stage}`); oldStage.classList.add("stage-leaving");
    transitionTimer = setTimeout(() => {
      oldStage.hidden = true; oldStage.classList.remove("stage-leaving");
      state.stage = index; state.maxStage = Math.max(state.maxStage, index);
      const next = $(`#stage-${index}`); next.hidden = false;
      renderNavigation(); window.scrollTo({ top: 0, behavior: "instant" });
      $(`#title-${index}`).focus({ preventScroll: true });
      state.transitioning = false;
      if (pushHistory) history.pushState({ chapter: index }, "", `#${chapters[index].toLowerCase()}`);
      if (index === 5) burst(0, 0, 155, true);
    }, motionPreference.matches ? 0 : 260);
  }
  chapters.forEach((label, index) => {
    const li = document.createElement("li"), button = document.createElement("button");
    button.type = "button"; button.innerHTML = `${icon(chapterIcons[index])}<span>${label}</span>`;
    button.addEventListener("click", () => goToStage(index)); li.append(button); $("#chapter-list").append(li);
  });
  $$('[data-next]').forEach(button => button.addEventListener("click", () => { if (stageComplete()) goToStage(state.stage + 1); }));
  $("#back-button").addEventListener("click", () => goToStage(state.stage - 1));
  $(".wordmark").addEventListener("click", event => { event.preventDefault(); goToStage(0); });
  window.addEventListener("popstate", event => { const index = Number(event.state?.chapter); if (state.started && Number.isInteger(index) && index >= 0 && index <= state.maxStage) goToStage(index, false); });

  $("#wish-star").addEventListener("click", () => {
    burstAt($("#wish-star"), 64); state.star = true; $("#wish-star").classList.add("awakened");
    $("#wish-star").setAttribute("aria-label", "Your star is glowing. Touch for a little more magic.");
    $("#star-message").textContent = format(birthdayConfig.introMessage);
    $("#star-hint").textContent = "and just like that, the universe lit up";
    $("#star-next").disabled = false;
  });

  function extinguish(index) {
    if (state.candles.has(index)) return;
    state.candles.add(index);
    const candle = $$(".candle")[index]; candle.classList.add("extinguished"); candle.disabled = true; candle.setAttribute("aria-label", `Candle ${index + 1}, extinguished`);
    const remaining = 5 - state.candles.size;
    $("#candle-message").textContent = remaining ? `${remaining} ${remaining === 1 ? "candle" : "candles"} left. Keep that wish close.` : "Wish made. May the universe be listening.";
    if (!remaining) { stopMic(); $("#cake-next").disabled = false; $("#blow-button").hidden = true; $(".cake-glow").style.opacity = ".3"; burstAt($(".cake-scene"), 62); }
  }
  for (let i = 0; i < 5; i++) {
    const button = document.createElement("button"); button.className = "candle"; button.type = "button"; button.setAttribute("aria-label", `Blow out candle ${i + 1}`);
    button.innerHTML = '<span class="flame" aria-hidden="true"></span><span class="smoke" aria-hidden="true"></span>';
    button.addEventListener("click", () => extinguish(i)); $(".candles").append(button);
  }
  const micSupported = !!(window.isSecureContext && navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));
  $("#blow-button").hidden = !micSupported;
  function stopMic() {
    micRequest++; clearTimeout(micTimer); cancelAnimationFrame(micFrame);
    if (micStream) micStream.getTracks().forEach(track => track.stop()); micStream = null;
    if (micSource) { try { micSource.disconnect(); } catch {} micSource = null; }
    const wasActive = micActive; micActive = false;
    $("#blow-button").classList.remove("listening"); $("#blow-button span").textContent = "Or blow out the candles";
    if (wasActive && soundWanted && !document.hidden) { audio.play().catch(() => {}); }
  }
  $("#blow-button").addEventListener("click", async () => {
    if (micActive) { stopMic(); return; }
    const ac = getAudioContext(); if (!ac) return;
    const request = ++micRequest; micActive = true; audio.pause();
    $("#blow-button span").textContent = "Waiting for microphone… tap to cancel"; $("#blow-button").classList.add("listening");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
      if (request !== micRequest || state.stage !== 1 || document.hidden) { stream.getTracks().forEach(t => t.stop()); return; }
      micStream = stream; await ac.resume();
      const analyser = ac.createAnalyser(); analyser.fftSize = 1024; micSource = ac.createMediaStreamSource(stream); micSource.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize); let loudFrames = 0;
      $("#blow-button span").textContent = "Blow gently near your mic · tap to stop";
      const listen = () => {
        if (!micActive) return;
        analyser.getByteTimeDomainData(samples); let square = 0;
        for (const sample of samples) square += ((sample - 128) / 128) ** 2;
        loudFrames = Math.sqrt(square / samples.length) > .075 ? loudFrames + 1 : Math.max(0, loudFrames - 1);
        if (loudFrames > 10) { for (let i = 0; i < 5; i++) extinguish(i); return; }
        micFrame = requestAnimationFrame(listen);
      };
      micFrame = requestAnimationFrame(listen);
      micTimer = setTimeout(() => { stopMic(); $("#candle-message").textContent = "No rush. You can always tap each flame instead."; }, 10000);
    } catch { if (request === micRequest) { stopMic(); $("#candle-message").textContent = "The microphone isn’t available. Tap the flames to make your wish."; } }
  });

  function makeBalloons() {
    $("#balloon-garden").replaceChildren(); $("#balloon-messages").replaceChildren(); $("#balloon-garden").classList.toggle("all-popped", state.balloons.size === 5);
    const colors = [["#f1bbcf", "#bf668c"], ["#f3da8a", "#bd923c"], ["#c8b8f5", "#8e71cf"], ["#97e3d7", "#409c94"], ["#f6bda7", "#c67458"]];
    for (let i = 0; i < 5; i++) {
      const slot = document.createElement("div"); slot.className = "balloon-slot";
      const message = document.createElement("div"); message.className = "message-card"; message.id = `message-card-${i}`;
      message.style.setProperty("--card-accent", colors[i][0]);
      message.innerHTML = `${icon("heart")}<small>REMINDER 0${i + 1}</small><p></p>`;
      $("p", message).textContent = format(birthdayConfig.balloonMessages?.[i] || birthdayConfig.finalMessage);
      message.setAttribute("aria-hidden", "true");
      const button = document.createElement("button"); button.className = "balloon"; button.type = "button";
      button.style.cssText = `--balloon-light:${colors[i][0]};--balloon-dark:${colors[i][1]};--delay:${-i * .9}s`;
      button.setAttribute("aria-label", `Pop balloon ${i + 1} to reveal a message`); button.setAttribute("aria-controls", message.id); button.setAttribute("aria-expanded", "false");
      button.innerHTML = `<span class="balloon-body" aria-hidden="true">${i + 1}</span><span class="balloon-string" aria-hidden="true"></span>`;
      button.addEventListener("click", () => {
        if (state.balloons.has(i)) return;
        state.balloons.add(i); burstAt(button, 37); popSound(); button.classList.add("popped"); button.setAttribute("aria-expanded", "true");
        message.classList.add("revealed"); message.removeAttribute("aria-hidden");
        const all = state.balloons.size === 5;
        $("#balloon-message").textContent = all ? format(birthdayConfig.balloonFinalMessage) : `${state.balloons.size} of 5 little reminders discovered`;
        announce(`${$("p", message).textContent}${all ? " " + format(birthdayConfig.balloonFinalMessage) : ""}`);
        if (all) { $("#balloon-next").disabled = false; setTimeout(() => $("#balloon-garden").classList.add("all-popped"), motionPreference.matches ? 0 : 350); }
        setTimeout(() => { const focused = document.activeElement === button; button.hidden = true; if (focused) { const next = $$(".balloon").find(b => !b.hidden && !b.classList.contains("popped")); (next || $("#balloon-next")).focus({ preventScroll: true }); } }, motionPreference.matches ? 0 : 320);
      });
      if (state.balloons.has(i)) { button.hidden = true; message.classList.add("revealed"); message.removeAttribute("aria-hidden"); }
      slot.append(button); $("#balloon-garden").append(slot); $("#balloon-messages").append(message);
    }
  }

  let memories = [];
  const gallery = $("#memory-gallery");
  function imageFallback(box) { box.classList.remove("is-loading"); box.replaceChildren(); const fallback = document.createElement("span"); fallback.className = "photo-fallback"; fallback.textContent = "A beautiful moment, waiting to be kept."; box.append(fallback); }
  function renderGallery() {
  memories = Array.isArray(birthdayConfig.memories) ? birthdayConfig.memories.slice(0, 5).filter(Boolean) : [];
  gallery.replaceChildren(); $("#memory-dots").replaceChildren();
  memories.forEach((memory, index) => {
    const figure = document.createElement("figure"); figure.className = "polaroid";
    figure.setAttribute("role", "group"); figure.setAttribute("aria-roledescription", "slide"); figure.setAttribute("aria-label", `${index + 1} of ${memories.length}`);
    const box = document.createElement("div"); box.className = "memory-image is-loading";
    const img = document.createElement("img"); img.alt = memory.alt || memory.caption || `Memory ${index + 1}`; img.width = 480; img.height = 480; img.draggable = false; img.decoding = "async";
    img.addEventListener("load", () => box.classList.remove("is-loading")); img.addEventListener("error", () => imageFallback(box));
    if (memory.image) img.src = memory.image; else imageFallback(box);
    if (memory.image) box.append(img);
    const caption = document.createElement("figcaption"); caption.textContent = memory.caption || "A moment to keep";
    figure.append(box, caption); gallery.append(figure);
    const dot = document.createElement("button"); dot.type = "button"; dot.setAttribute("aria-label", `Show memory ${index + 1}: ${memory.caption || "A moment to keep"}`);
    dot.addEventListener("click", () => setMemory(index)); $("#memory-dots").append(dot);
  });
  if (!memories.length) { const figure = document.createElement("figure"); figure.className = "polaroid"; figure.style.cssText = "--offset:0;--abs:0;--rotation:-3deg;--scale:1;--opacity:1;--z:3"; figure.innerHTML = '<div class="memory-image"><span class="photo-fallback">The best memories<br>are still to come.</span></div><figcaption>Here’s to the next chapter</figcaption>'; gallery.append(figure); }
  $(".gallery-controls").hidden = memories.length < 2;
  setMemory(Math.min(state.memory, Math.max(0, memories.length - 1)));
  }
  function setMemory(index) {
    if (!memories.length) return;
    state.memory = (index + memories.length) % memories.length;
    $$(".polaroid", gallery).forEach((photo, i) => {
      let offset = i - state.memory;
      if (offset > memories.length / 2) offset -= memories.length;
      if (offset < -memories.length / 2) offset += memories.length;
      const abs = Math.abs(offset);
      photo.style.cssText = `--offset:${offset};--abs:${abs};--rotation:${offset === 0 ? -2 : offset < 0 ? -9 : 8}deg;--scale:${abs === 0 ? 1 : .87};--opacity:${abs > 1 ? 0 : abs === 0 ? 1 : .64};--z:${3 - abs}`;
      photo.setAttribute("aria-hidden", String(offset !== 0));
    });
    $$("#memory-dots button").forEach((dot, i) => dot.setAttribute("aria-current", String(i === state.memory)));
    $("#memory-status").textContent = `${state.memory + 1} / ${memories.length} · ${memories[state.memory].caption || "A moment to keep"} · Swipe to explore`;
  }
  $("#memory-prev").addEventListener("click", () => setMemory(state.memory - 1));
  $("#memory-next").addEventListener("click", () => setMemory(state.memory + 1));
  gallery.addEventListener("keydown", event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setMemory(state.memory + (event.key === "ArrowRight" ? 1 : -1)); } });
  let pointerStart = null;
  gallery.addEventListener("pointerdown", event => { if (event.isPrimary === false) return; pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId }; try { gallery.setPointerCapture(event.pointerId); } catch {} });
  gallery.addEventListener("pointerup", event => { if (!pointerStart || pointerStart.id !== event.pointerId) return; const dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y; pointerStart = null; if (Math.abs(dx) > 38 && Math.abs(dx) > Math.abs(dy) * 1.2) setMemory(state.memory + (dx < 0 ? 1 : -1)); });
  gallery.addEventListener("pointercancel", () => { pointerStart = null; });
  if (!("PointerEvent" in window)) { let start; gallery.addEventListener("touchstart", event => { start = event.touches[0]; }, { passive: true }); gallery.addEventListener("touchend", event => { if (!start) return; const dx = event.changedTouches[0].clientX - start.clientX; if (Math.abs(dx) > 40) setMemory(state.memory + (dx < 0 ? 1 : -1)); start = null; }, { passive: true }); }
  renderGallery();

  $("#envelope").addEventListener("click", () => {
    if (state.letter) return;
    state.letter = true; $("#envelope").classList.add("opened"); $("#envelope").setAttribute("aria-expanded", "true");
    $("#open-letter-hint").hidden = true; $("#envelope-hint").textContent = "Take your time. These words are yours to keep.";
    envelopeTimer = setTimeout(() => {
      $("#letter-paper").hidden = false; $("#letter-next").disabled = false;
      $("#letter-greeting").tabIndex = -1; $("#letter-greeting").focus({ preventScroll: true });
      if (state.stage === 4) $("#letter-paper").scrollIntoView({ behavior: motionPreference.matches ? "instant" : "smooth", block: "start" });
    }, motionPreference.matches ? 0 : 600);
  });
  $("#celebrate-again").addEventListener("click", () => { burst(0, 0, 165, true); announce(motionPreference.matches ? "One more birthday wish, just for you." : "A sky full of birthday confetti."); });
  $("#replay").addEventListener("click", () => {
    stopMic(); clearTimeout(transitionTimer); clearTimeout(envelopeTimer); clearParticles();
    Object.assign(state, { stage: 0, maxStage: 0, star: false, candles: new Set(), balloons: new Set(), memory: 0, letter: false, transitioning: false, started: false });
    $$(".stage").forEach((stage, index) => { stage.hidden = index !== 0; stage.classList.remove("stage-leaving"); });
    $("#wish-star").classList.remove("awakened"); $("#wish-star").setAttribute("aria-label", "Touch the star to begin your birthday surprise");
    $("#star-message").textContent = "Go on. Touch the star."; $("#star-hint").textContent = "a little magic starts with a touch"; $("#star-next").disabled = true;
    $$(".candle").forEach((candle, index) => { candle.disabled = false; candle.classList.remove("extinguished"); candle.setAttribute("aria-label", `Blow out candle ${index + 1}`); });
    $(".cake-glow").style.opacity = ""; $("#candle-message").textContent = "Five candles. A sky full of possibilities."; $("#blow-button").hidden = !micSupported; $("#cake-next").disabled = true;
    $("#balloon-message").textContent = "0 of 5 little reminders discovered"; $("#balloon-next").disabled = true; makeBalloons(); setMemory(0);
    $("#envelope").classList.remove("opened"); $("#envelope").setAttribute("aria-expanded", "false"); $("#envelope-hint").textContent = "A few words, folded up with a whole lot of love. This one has your name on it.";
    $("#open-letter-hint").hidden = false; $("#letter-paper").hidden = true; $("#letter-next").disabled = true;
    pauseMusic(true); renderNavigation(); $("#site-shell").hidden = true; $("#welcome").hidden = false; window.scrollTo(0, 0); $("#recipient-name").focus({ preventScroll: true });
    $("#preview-surprise").innerHTML = `Preview the surprise ${icon("arrow")}`;
    if (recipientMode) { $("#welcome").hidden = true; $("#gift-intro").hidden = false; $("#open-gift").focus({preventScroll:true}); }
    history.replaceState({ chapter: 0 }, "", location.pathname + location.search);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { clearParticles(); stopMic(); audio.pause(); }
    else if (soundWanted) { audio.play().catch(() => setSoundUI(false)); }
  });
  window.addEventListener("pagehide", () => { stopMic(); audio.pause(); clearParticles(); });
  window.addEventListener("resize", resizeCanvas, { passive: true });
  if (motionPreference.addEventListener) motionPreference.addEventListener("change", () => { if (motionPreference.matches) clearParticles(); });
  window.birthdayJourney = {
    configure(data) { Object.assign(birthdayConfig, data); hydrateContent(); makeBalloons(); audio.src = birthdayConfig.music; },
    openGift() {
      $("#gift-intro").hidden = true; $("#welcome").hidden = true; $("#site-shell").hidden = false;
      state.started = true; $("#edit-details").hidden = true; $("#final-create-link").hidden = true;
      soundMode = birthdayConfig.soundtrackDefault; renderNavigation(); window.scrollTo(0, 0);
      $("#title-0").focus({preventScroll:true}); getAudioContext(); if (soundMode !== "silent") playMusic();
      history.replaceState({chapter:0}, "", "#star");
    },
    pause: pauseMusic
  };
  makeStars(); resizeCanvas(); renderNavigation();
})();
