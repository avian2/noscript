'use strict';

debug = () => {}; 

var _ = browser.i18n.getMessage;

var bgToken;
var canScript = true;
var embeddingDocument = false;

var seen = [];

var handlers = {
  probe(event) {
    let noscript = getPersistent(event.token);
    return noscript && noscript.records;
  },

  seen(event) {
    let {allowed, policyType, request, ownFrame} = event;
    seen.push(event);
    if (ownFrame) {
      init();
      if (!allowed && PlaceHolder.canReplace(policyType)) {
        request.embeddingDocument = embeddingDocument;
        PlaceHolder.create(policyType, request);
      }
    }
  },

  noscript(event) {
    // this page can't do scripting, let's mark it and cope with that
    let {token, records} = event;
    if (token) bgToken = token;
    let tag = document.createComment(JSON.stringify({token, records}));
    let root = document.documentElement;
    root.insertBefore(tag, root.firstChild);
  },

  collect(event) {
    debug("COLLECT", seen);
    return seen;
  }
};

browser.runtime.onMessage.addListener(async event => {
  if (event.type in handlers) {
    debug("Received message", event);
    return handlers[event.type](event);
  }
});


function getPersistent(token = bgToken) {
  let node = document.documentElement.firstChild;
  if (node.nodeType === 8 && token) { // comment
    let text = node.textContent;
    if (text.includes(token)) {
      try {
        let persistent = JSON.parse(text);
        if (persistent.token === token) {
          return persistent;
        }
      } catch (e) {
        error(e);
      }
    }
  }
  return null;
}

try {
  window.eval("");
} catch (e) {
  // sending a probe to our CSP violation listener, so canScript is already primed
}

if (document.readyState !== "complete") {
  window.addEventListener("pageshow", init);
} else init();

async function init() {
  init = () => {};
  canScript = await browser.runtime.sendMessage({type: "canScript"});

  seen.push({
      request: {
        id: "noscript-probe",
        url: document.URL,
        documentUrl: document.URL,
        type: window === window.top ? "main_frame" : "script",
      },
      allowed: canScript
    }
  );

  if (!canScript) {
    for (let noscript of document.querySelectorAll("noscript")) {
      // force show NOSCRIPT elements content
      let replacement = document.createElement("div");
      replacement.innerHTML = noscript.innerHTML;
      noscript.parentNode.replaceChild(replacement, noscript);
      // emulate meta-refresh
      let meta = replacement.querySelector('meta[http-equiv="refresh"]');
      if (meta) {
        let content = meta.getAttribute("content");
        if (content) {
          let [secs, url] = content.split(/\s*;\s*url\s*=\s*/i);
          if (url) {
            try {
              let urlObj = new URL(url);
              if (!/^https?:/.test(urlObj.protocol)) {
                continue;
              }
            } catch (e) {
            }
            window.setTimeout(() => location.href = url, (parseInt(secs) || 0) * 1000);
          }
        }
      }
    }
  }


  debug(`Loading NoScript in document %s, scripting=%s, content type %s readyState %s`,
    document.URL, canScript, document.contentType, document.readyState);

  if (/application|video|audio/.test(document.contentType)) {
    debug("Embedding document detected");
    embeddingDocument = true;
    window.addEventListener("pageshow", e => {
      debug("Active content still in document %s: %o", document.url, document.querySelectorAll("embed,object,video,audio"));
    }, true);
    // document.write("<plaintext>");
  }

  let notifyPage = () => browser.runtime.sendMessage({type: "pageshow", seen, canScript});
  if (document.readyState === "complete") notifyPage();
  else addEventListener("pageshow", notifyPage);
};
