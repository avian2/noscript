'use strict';
var _ = browser.i18n.getMessage;
var bgToken;

var canScript = false;
var embeddingDocument = false;
try {
  window.eval("");
  canScript = true;
} catch(e) {}

var seen = [{
  request: {
    id: "noscript-probe",
    url: document.URL,
    documentUrl: document.URL,
    type: window === window.top ? "main_frame" : "script",
  },
  allowed: canScript
}];

debug(`Loading NoScript in document %s, scripting=%s, content type %s`,
  document.URL, canScript, document.contentType);

if (/application|video|audio/.test(document.contentType)) {
  debug("Embedding document detected");
  embeddingDocument = true;
  window.addEventListener("pageshow", e => {
    debug("Active content still in document %s: %o", document.url, document.querySelectorAll("embed,object,video,audio"));
  }, true);
  // document.write("<plaintext>");
}

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

var handlers = {
  probe(event) {
    let records = null;
    if (!canScript) {
      let noscript = getPersistent(event.token);
      debug(e);
      debug(`Can't run scripts on ${document.URL}`, noscript);
      records = noscript && noscript.records;
    }
    return records;
  },

  seen(event) {
    let {allowed, policyType, request, ownFrame} = event;
    seen.push(event);
    if (ownFrame) {
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

addEventListener("pageshow", e => {
  browser.runtime.sendMessage({type: e.type, seen, canScript});
});
