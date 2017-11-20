(() =>{
  let urlMap = new WeakMap();
  let createObjectURL = window.URL.createObjectURL;
  window.URL.createObjectURL = function(o, ...args) {
    let url = createObjectURL.call(this, o, ...args);
    if (o instanceof MediaSource) {
      let urls = urlMap.get(o);
      if (!urls) urlMap.set(o, urls = new Set());
      urls.add(url);
    }
    return url;
  };
  let proto = window.MediaSource.prototype;
  let addSourceBuffer = proto.addSourceBuffer;
  proto.addSourceBuffer = function(mime, ...args) {
    let ms = this;
    let urls = urlMap.get(ms);
    let me = Array.from(document.querySelectorAll("video,audio")).find(e => e.srcObject === ms || urls && urls.has(e.src));
    let exposedMime = `${mime} (MSE)`;
    let ev = new CustomEvent("NoScript:MSE", {cancelable: true, detail: { mime: exposedMime, blocked: false }});

    (me || document).dispatchEvent(ev);

    if (ev.detail.blocked) {
      throw new Error(`${exposedMime} blocked by NoScript`);
    }
    return addSourceBuffer.call(ms, mime, ...args);
  };
})();
