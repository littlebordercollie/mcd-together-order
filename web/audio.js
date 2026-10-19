let active = null;
let run = 0;
let enabled = false;
let timer;
export function stopAudio() {
  clearTimeout(timer);
  run++;
  if (active) {
    active.pause();
    active = null;
  }
  globalThis.speechSynthesis?.cancel();
  document
    .querySelectorAll(".speaking")
    .forEach((e) => e.classList.remove("speaking"));
}
export function enableVoice() {
  enabled = true;
}
export function speak(text, key, button) {
  stopAudio();
  enabled = true;
  const current = run;
  button?.classList.add("speaking");
  const done = () => {
    if (current === run) button?.classList.remove("speaking");
  };
  const fallback = () => {
    if (current !== run) return;
    if (!globalThis.speechSynthesis) {
      done();
      document.dispatchEvent(new CustomEvent("audio-error"));
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "zh-CN";
    u.rate = 0.82;
    u.voice =
      speechSynthesis.getVoices().find((v) => v.lang === "zh-CN") || null;
    u.onend = done;
    u.onerror = () => {
      done();
      document.dispatchEvent(new CustomEvent("audio-error"));
    };
    speechSynthesis.speak(u);
  };
  if (key) {
    active = new Audio(`assets/audio/${key}.mp3`);
    active.onended = done;
    active.onerror = fallback;
    active.play().catch(fallback);
  } else fallback();
}
export function bindHoverAudio(root) {
  root.addEventListener("pointerover", (e) => {
    if (!enabled || !matchMedia("(hover:hover)").matches) return;
    const b = e.target.closest("[data-listen]");
    if (b) {
      clearTimeout(timer);
      timer = setTimeout(() => speak(b.dataset.text, b.dataset.listen, b), 450);
    }
  });
  root.addEventListener("pointerout", () => clearTimeout(timer));
  // Focus announces only after the user has explicitly enabled speech.
  root.addEventListener("focusin", (e) => {
    const b = e.target.closest("[data-listen]");
    if (enabled && b) {
      clearTimeout(timer);
      timer = setTimeout(() => speak(b.dataset.text, b.dataset.listen, b), 450);
    }
  });
  root.addEventListener("focusout", () => clearTimeout(timer));
}
