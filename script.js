document.addEventListener("DOMContentLoaded", () => {
  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // ---------- Shared math helpers ----------
  const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, v) => { const x = clamp((v - e0) / (e1 - e0)); return x * x * (3 - 2 * x); };
  const segmentInOut = (s, a, b, c, d) => {
    const enter = smoothstep(a, b, s), exit = smoothstep(c, d, s);
    return { enter, exit, active: enter * (1 - exit) };
  };
  let rafPending = false;
  function requestTick() {
    if (!rafPending) {
      rafPending = true;
      requestAnimationFrame(runFrame);
    }
  }

  const updaters = [];
  function runFrame() {
    rafPending = false;
    let keepGoing = false;
    for (const fn of updaters) {
      if (fn()) keepGoing = true;
    }
    if (keepGoing) requestTick();
  }

  // Shared pointer state (used for the hero's subtle parallax).
  let targetMouseX = 0, targetMouseY = 0;
  let mouseX = 0, mouseY = 0;
  window.addEventListener("pointermove", (e) => {
    targetMouseX = e.clientX / window.innerWidth - 0.5;
    targetMouseY = e.clientY / window.innerHeight - 0.5;
    requestTick();
  }, { passive: true });

  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);

  // ================= HERO CINEMA (scroll-scrubbed video background) =================
  (function heroCinema() {
    const section = document.querySelector(".cinema-scroll");
    if (!section) return;

    const contactMini = document.querySelector(".contact-mini");
    const canvas = document.getElementById("scrubCanvas");
    const ctx = canvas ? canvas.getContext("2d", { alpha: false }) : null;
    const panelSystems = document.getElementById("systems");
    const panelIdeas = document.getElementById("ideas");
    const panelVision = document.getElementById("vision");
    const panelAutomation = document.getElementById("automation");
    const panelNext = document.getElementById("next");

    function applyStoryPanel(frame, cssPrefix, element) {
      const opacity = frame.active * (1 - frame.exit);
      const y = `calc(-50% + ${(-frame.exit * 86 + (1 - frame.enter) * 58).toFixed(4)}px)`;
      root.style.setProperty(`--panel-${cssPrefix}-opacity`, opacity.toFixed(4));
      root.style.setProperty(`--panel-${cssPrefix}-y`, y);
      if (element) {
        element.classList.toggle("is-active", opacity > 0.35);
      }
    }

    const FRAME_COUNT = 292;
    const FRAME_SRC = (i) => `frames/ezgif-frame-${String(i).padStart(3, "0")}.jpg`;
    const frameImages = new Array(FRAME_COUNT);
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = FRAME_SRC(i + 1);
      img.addEventListener("load", () => { lastRenderedLow = -1; requestTick(); }, { once: true });
      frameImages[i] = img;
    }

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let lastRenderedLow = -1, lastRenderedAlpha = -1;

    function resizeCanvas() {
      if (!canvas) return;
      const cssW = canvas.clientWidth || window.innerWidth;
      const cssH = canvas.clientHeight || window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      lastRenderedLow = -1;
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();

    function drawCover(img, alpha) {
      if (!ctx || !img.naturalWidth) return;
      const cw = canvas.width, ch = canvas.height;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const scale = Math.max(cw / iw, ch / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.globalAlpha = 1;
    }

    function renderFrame(frameFloat) {
      if (!ctx) return;
      const clampedFloat = clamp(frameFloat, 0, FRAME_COUNT - 1);
      const low = Math.floor(clampedFloat);
      const high = Math.min(low + 1, FRAME_COUNT - 1);
      const alpha = clampedFloat - low;
      if (low === lastRenderedLow && Math.abs(alpha - lastRenderedAlpha) < 0.004) return;
      lastRenderedLow = low;
      lastRenderedAlpha = alpha;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const imgLow = frameImages[low];
      if (imgLow.complete && imgLow.naturalWidth) {
        drawCover(imgLow, 1);
      } else {
        for (let i = low; i >= 0; i--) {
          if (frameImages[i].complete && frameImages[i].naturalWidth) { drawCover(frameImages[i], 1); break; }
        }
      }
      const imgHigh = frameImages[high];
      if (alpha > 0.01 && imgHigh.complete && imgHigh.naturalWidth) drawCover(imgHigh, alpha);
    }

    let targetScroll = 0, smoothScroll = 0, initialized = false;

    const maxScrollDistance = () => Math.max(1, section.offsetHeight - window.innerHeight);
    const getScrollDistance = () => clamp(-section.getBoundingClientRect().top, 0, maxScrollDistance());

    function update() {
      targetScroll = getScrollDistance();
      if (!initialized || reduceMotion.matches) {
        smoothScroll = targetScroll;
        initialized = true;
      } else {
        smoothScroll = lerp(smoothScroll, targetScroll, 0.18);
      }
      if (Math.abs(smoothScroll - targetScroll) < 0.05) smoothScroll = targetScroll;

      mouseX = lerp(mouseX, targetMouseX, 0.12);
      mouseY = lerp(mouseY, targetMouseY, 0.12);

      const totalProgress = clamp(smoothScroll / maxScrollDistance());
      renderFrame(totalProgress * (FRAME_COUNT - 1));

      // Hero exit
      const introExit = smoothstep(80, 580, smoothScroll);

      // Uniform timing windows across all 5 story panels
      const frameSystems = segmentInOut(smoothScroll, 500, 800, 1350, 1650);
      const frameIdeas = segmentInOut(smoothScroll, 1600, 1900, 2450, 2750);
      const frameVision = segmentInOut(smoothScroll, 2700, 3000, 3550, 3850);
      const frameAutomation = segmentInOut(smoothScroll, 3800, 4100, 4650, 4950);
      const frameNext = segmentInOut(smoothScroll, 4900, 5200, 5750, 6050);

      // Contact mini popup fade-in near the end
      const contactMiniOpacity = smoothstep(0.91, 0.98, totalProgress);

      // Apply consistent transitions to all sections
      applyStoryPanel(frameSystems, "systems", panelSystems);
      applyStoryPanel(frameIdeas, "ideas", panelIdeas);
      applyStoryPanel(frameVision, "vision", panelVision);
      applyStoryPanel(frameAutomation, "automation", panelAutomation);
      applyStoryPanel(frameNext, "next", panelNext);

      root.style.setProperty("--mx", reduceMotion.matches ? "0" : mouseX.toFixed(4));
      root.style.setProperty("--my", reduceMotion.matches ? "0" : mouseY.toFixed(4));

      root.style.setProperty("--title-y", `${(introExit * -210).toFixed(4)}px`);
      root.style.setProperty("--title-scale", (1 - introExit * 0.08).toFixed(4));
      root.style.setProperty("--title-opacity", (1 - introExit).toFixed(4));

      root.style.setProperty("--intro-copy-y", `${(introExit * 90).toFixed(4)}px`);
      root.style.setProperty("--intro-copy-opacity", (1 - introExit).toFixed(4));

      if (contactMini) {
        root.style.setProperty("--contact-mini-opacity", contactMiniOpacity.toFixed(4));
        const visible = contactMiniOpacity > 0.4;
        contactMini.classList.toggle("is-visible", visible);
        contactMini.classList.toggle("is-in", visible);
      }

      return (
        Math.abs(smoothScroll - targetScroll) > 0.05 ||
        Math.abs(mouseX - targetMouseX) > 0.001 ||
        Math.abs(mouseY - targetMouseY) > 0.001
      );
    }

    updaters.push(update);
  })();

  requestTick();
});
