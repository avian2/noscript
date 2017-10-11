var EXPORTED_SYMBOLS = ["PasteHandler"];

const Cu = Components.utils;

Cu.import("chrome://noscript/content/importer.jsm");
let IMPORT = IMPORT_FOR(this);

function PasteHandler(ctx) {
  this.ctx = ctx;
  ctx.addEventListener("paste", pasteEventHandler, true);
}

PasteHandler.prototype = {
  dispose() {
    this.ctx.removeEventListener("paste", pasteEventHandler, true);
  }
}



function pasteEventHandler(e) {
  if (typeof Cu === "undefined") { // uninstalled
    e.currentTarget.removeEventListener(e.type, arguments.callee, true);
    return;
  }
  Cu.import("resource://gre/modules/Services.jsm");
  if (!Services.prefs.getBoolPref("noscript.sanitizePaste")) {
    return;
  }
  let data = e.clipboardData;
  let html =  data.getData("text/html");
  let t = e.target;
  if (t.nodeType !== 1) t = t.parentElement;
    
  let console = t.ownerDocument.defaultView.console;

  try {
    let node = t.cloneNode();

    node.innerHTML = html;
    
    if (sanitizeExtras(node)) {
      let sanitized = node.innerHTML;
      IMPORT("defer");
      defer(function() { try {
        sanitizeExtras(t);
        console.log("[NoScript] Sanitized\n<PASTE>\n" + html + "\n</PASTE>to\n<PASTE>\n" + sanitized + "</PASTE>");
      } catch(ex) {
       console.log(ex);
      }}, 0);
    }
  } catch(ex) {
    console.log(ex);
  }
}

function sanitizeExtras(el) {
  let ret = false;

  // remove attributes from forms
  for (let f of el.getElementsByTagName("form")) {
    for (let a of f.attributes) {
      f.removeAttribute(a.name);
      ret = true;
    }
  }
  
  let doc = el.ownerDocument;

  // remove dangerous URLs (e.g. javascript: or data: URLs)
  for (let a of ['href', 'to', 'from', 'by', 'values']) {
    let res = doc.evaluate('//@' + a, el, null, /* DOMXPathResult.UNORDERED_NODE_SNAPSHOT_TYPE */ 6, null);
    for (let j = res.snapshotLength; j-- > 0;) {
      let attr = res.snapshotItem(j);
      if (/^\W*(?:(?:javascript|data):|https?:[\s\S]+[[(<])/i.test(unescape(attr.value))) {
        attr.value = "javascript:void(0)";
        ret = true;
      }
    }
  }
  return ret;
}

