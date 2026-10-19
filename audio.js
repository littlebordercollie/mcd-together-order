const audioRoot = "assets/audio/minimax/";
let active = null;
let run = 0;
let timer;
function markSpeaking(element, speaking) {
  element?.classList.toggle("speaking", speaking);
  const button = element?.matches(".listen")
    ? element
    : element?.querySelector(".listen");
  button?.classList.toggle("speaking", speaking);
  const label = button?.querySelector("span");
  if (label) label.textContent = speaking ? "正在播放" : "听一听";
}
export function stopAudio() {
  clearTimeout(timer);
  run++;
  if (active) {
    active.pause();
    active = null;
  }
  document
    .querySelectorAll(".speaking")
    .forEach((el) => markSpeaking(el, false));
}
export function speak(key, element) {
  stopAudio();
  const current = run;
  const keys = Array.isArray(key)
    ? key
    : String(key || "")
        .split("|")
        .filter(Boolean);
  const finish = () => {
    if (current === run) markSpeaking(element, false);
  };
  const fail = (error) => {
    if (current !== run) return;
    finish();
    document.dispatchEvent(
      new CustomEvent("audio-error", {
        detail: { needsGesture: error?.name === "NotAllowedError" },
      }),
    );
  };
  if (!keys.length || keys.some((value) => !/^[a-z0-9-]+$/.test(value))) {
    fail();
    return;
  }
  markSpeaking(element, true);
  let index = 0;
  const next = () => {
    if (current !== run) return;
    if (index === keys.length) {
      active = null;
      finish();
      return;
    }
    active = new Audio(audioRoot + keys[index++] + ".mp3");
    active.onended = next;
    active.onerror = fail;
    active.play().catch(fail);
  };
  next();
}
export function bindHoverAudio(root) {
  let target = null;
  const source = (node) =>
    node instanceof Element
      ? node.closest("[data-audio-hover]") || node.closest("[data-listen]")
      : null;
  const schedule = (element) => {
    clearTimeout(timer);
    target = element;
    if (!element) return;
    timer = setTimeout(() => {
      if (element.isConnected && target === element)
        speak(element.dataset.audioHover || element.dataset.listen, element);
    }, 450);
  };
  root.addEventListener("pointerover", (event) => {
    if (event.pointerType === "touch" || !matchMedia("(hover:hover)").matches)
      return;
    const next = source(event.target);
    if (
      !next?.matches("[data-audio-hover]") &&
      next !== source(event.relatedTarget)
    )
      schedule(next);
  });
  root.addEventListener("pointermove", (event) => {
    if (
      event.pointerType === "touch" ||
      !matchMedia("(hover:hover)").matches ||
      !(event.movementX || event.movementY)
    )
      return;
    const next = source(event.target);
    if (next?.matches("[data-audio-hover]") && next !== target) schedule(next);
  });
  root.addEventListener("pointerout", (event) => {
    if (source(event.target) !== source(event.relatedTarget)) {
      clearTimeout(timer);
      target = null;
    }
  });
  root.addEventListener("focusin", (event) => {
    const next = source(event.target);
    if (next !== source(event.relatedTarget)) schedule(next);
  });
  root.addEventListener("focusout", (event) => {
    if (source(event.target) !== source(event.relatedTarget)) {
      clearTimeout(timer);
      target = null;
    }
  });
}
