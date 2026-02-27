export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function beep(freq = 880, dur = 120) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.value = 0.08;
    o.start();
    setTimeout(() => {
      o.stop();
      ctx.close();
    }, dur);
  } catch {}
}

export function logoPosClass(pos) {
  switch (pos) {
    case "top-left": return "pos-top-left";
    case "top-center": return "pos-top-center";
    case "top-right": return "pos-top-right";
    case "bottom-left": return "pos-bottom-left";
    case "bottom-center": return "pos-bottom-center";
    case "bottom-right": return "pos-bottom-right";
    case "center": return "pos-center";
    default: return "pos-top-left";
  }
}
