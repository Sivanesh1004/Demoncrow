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

    const cosmicOverlay = document.querySelector(".cosmic-overlay");
    const cardA = document.querySelector('[data-card="A"]');
    const cardB = document.querySelector('[data-card="B"]');
    const cardC = document.querySelector('[data-card="C"]');
    const cardD = document.querySelector('[data-card="D"]');

    // Card position/opacity for the left/right duo-card reveal.
    function setCard(card, side, enter, exit) {
      if (!card) return;
      const dir = side === "left" ? -1 : 1;
      const tx = lerp(dir * 60, 0, enter) + exit * dir * 18;
      const ty = (1 - enter) * 18 - exit * 10;
      const scale = lerp(0.9, 1, enter) - exit * 0.05;
      const opacity = clamp(enter) * (1 - exit);

      card.style.setProperty("--duo-tx", `${tx.toFixed(2)}vw`);
      card.style.setProperty("--duo-ty", `${ty.toFixed(2)}px`);
      card.style.setProperty("--duo-scale", scale.toFixed(4));
      card.style.setProperty("--duo-op", opacity.toFixed(4));
      card.classList.toggle("is-in", enter > 0.55 && exit < 0.5);
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

      // Text-panel timing windows — these now only drive opacity/position for
      // the text itself. No blur, brightness, or shade is applied to the
      // background behind them, so the video stays fully visible throughout.
      const frame2 = segmentInOut(smoothScroll, 560, 900, 1300, 1620);
      const frame3 = segmentInOut(smoothScroll, 1760, 2140, 2540, 2700);
      const introExit = smoothstep(90, 650, smoothScroll);
      const panel2Opacity = frame2.active * (1 - frame2.exit);
      const panel3Opacity = frame3.active * (1 - frame3.exit);
      const totalProgressForFade = totalProgress;
      const contactMiniOpacity = smoothstep(0.93, 0.99, totalProgressForFade);

      // ---- Duo-card reveal: starts right after "Practical Systems & Work" (frame3,
      // which wraps up around 2700px), finishes well before the video's closing
      // frames (~5983px onward). All still keyed off the same smoothScroll. ----
      const cosmic = segmentInOut(smoothScroll, 2750, 3200, 5350, 5750);
      const enter1 = smoothstep(2900, 3350, smoothScroll);
      const exit1 = smoothstep(3900, 4350, smoothScroll);
      const enter2 = smoothstep(3900, 4350, smoothScroll);
      const exit2 = smoothstep(4900, 5600, smoothScroll);

      if (cosmicOverlay) root.style.setProperty("--cosmic-opacity", cosmic.active.toFixed(4));
      setCard(cardA, "left", enter1, exit1);
      setCard(cardB, "right", enter1, exit1);
      setCard(cardC, "left", enter2, exit2);
      setCard(cardD, "right", enter2, exit2);

      root.style.setProperty("--mx", reduceMotion.matches ? "0" : mouseX.toFixed(4));
      root.style.setProperty("--my", reduceMotion.matches ? "0" : mouseY.toFixed(4));

      root.style.setProperty("--title-y", `${(introExit * -210).toFixed(4)}px`);
      root.style.setProperty("--title-scale", (1 - introExit * 0.08).toFixed(4));
      root.style.setProperty("--title-opacity", (1 - introExit).toFixed(4));

      root.style.setProperty("--intro-copy-y", `${(introExit * 90).toFixed(4)}px`);
      root.style.setProperty("--intro-copy-opacity", (1 - introExit).toFixed(4));
      root.style.setProperty("--panel2-opacity", panel2Opacity.toFixed(4));
      root.style.setProperty("--panel2-y", `calc(-50% + ${(-frame2.exit * 86 + (1 - frame2.enter) * 58).toFixed(4)}px)`);
      root.style.setProperty("--panel3-opacity", panel3Opacity.toFixed(4));
      root.style.setProperty("--panel3-y", `calc(-50% + ${(-frame3.exit * 86 + (1 - frame3.enter) * 58).toFixed(4)}px)`);

      if (contactMini) {
        root.style.setProperty("--contact-mini-opacity", contactMiniOpacity.toFixed(4));
        const visible = contactMiniOpacity > 0.5;
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
