var EXPORTED_SYMBOLS = ["PasteHandler"];



function PasteHandler(ctx) {
  ctx.addEventListener("paste", pasteEventHandler, true);
}


function pasteEventHandler(e) {
  Components.utils.import("resource://gre/modules/Services.jsm");
  if (!Services.prefs.getBoolPref("noscript.sanitizePaste")) {
    return;
  }
  let data = e.clipboardData;
  let html =  data.getData("text/html")
  let t = e.target;
  if (t.nodeType !== 1) t = t.parentElement;
    
  let console = t.ownerDocument.defaultView.console;

  try {
    let node = t.cloneNode();

    node.innerHTML = html;
    
    if (sanitizeExtras(node)) {
      let sanitized = node.innerHTML;
      Components.utils.import("chrome://noscript/content/defer.jsm");
      defer(function() { try {
        sanitizeExtras(t);
        console.log("[NoScript] Sanitized\n<PASTE>\n" + html + "\n</PASTE>to\n<PASTE>\n" + sanitized + "</PASTE>");
      } catch(ex) {
       console.log(ex)
      }}, 0);
    }
  } catch(ex) {
    console.log(ex)
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
  
