try {
  (() => {
    let unpatched = new Map();
    function patch(obj, methodName, replacement) {
       let methods = unpatched.get(obj) || {};
       methods[methodName] = obj[methodName];
       exportFunction(replacement, obj, {defineAs: methodName});
       unpatched.set(obj, methods);
    }

    let urlMap = new WeakMap();
    patch(window.URL, "createObjectURL",  function(o, ...args) {
      let url = unpatched.get(window.URL).createObjectURL.call(this, o, ...args);
      if (o instanceof MediaSource) {
        let urls = urlMap.get(o);
        if (!urls) urlMap.set(o, urls = new Set());
        urls.add(url);
      }
      return url;
    });

    patch( window.MediaSource.prototype, "addSourceBuffer", function(mime, ...args) {
      let ms = this;
      let urls = urlMap.get(ms);
      let me = Array.from(document.querySelectorAll("video,audio"))
        .find(e => e.srcObject === ms || urls && urls.has(e.src));
      let exposedMime = `${mime} (MSE)`;
      let ev = new CustomEvent("NoScript:MSE", {cancelable: true, detail: { mime: exposedMime, blocked: false }});

      (me || document).dispatchEvent(ev);

      if (ev.detail.blocked) {
        throw new Error(`${exposedMime} blocked by NoScript`);
      }
      return unpatched.get(window.MediaSource.prototype).addSourceBuffer.call(ms, mime, ...args);
    });

  })();
} catch (e) {
  error(e, "Cannot patch MediaSource");
}
