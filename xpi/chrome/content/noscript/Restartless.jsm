var EXPORTED_SYMBOLS = ["startup", "shutdown", "upgrade", "loadIntoWindow", "unloadFromWindow"];
var { utils: Cu, interfaces: Ci } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import(`chrome://noscript/content/importer.jsm`);

Services.scriptloader.loadSubScript(NO_CACHE("loader.js"), this);

function loadPrefs(branch, uriOrFile, filter = null) {
    try {
      let setPref = (name, value) => {
        try {
          switch (typeof value) {
            case "boolean":
            branch.setBoolPref(name, value);
            break;

            case "number":
            branch.setIntPref(name, value);
            break;

            case "string":
            COMPAT.setStringPref(branch, name, value);
            break;
          }
        } catch (e) {
          Cu.reportError(`NoScript could not set default pref value for ${name}: ${e}`);
        }
      };
      
      if (typeof uriOrFile === "string") {
        let uri = uriOrFile;
        let pref = filter ? (name, value) => filter(name, value) && setPref(name, value)
                        : setPref;
        Services.scriptloader.loadSubScript(uri, { pref });
      } else {
        INCLUDE("IO");
        let file = uriOrFile;
        let prefJSON = JSON.parse(`[${IO.readFile(file).replace(/^[^p].*/mg, '')
                    .replace(/^pref\((.*)\);$/mg, "[$1],")
                    .replace(/,\s*$/, '')}]`);
        if (filter) prefJSON = prefJSON.filter(([name, value]) => filter(name, value));
        prefJSON.forEach(([name, value]) => setPref(name, value));
      }
  } catch (err) {
    Cu.reportError(err);
  }
}

function loadDefaultPrefs(xpiURI) {
  let branch = Services.prefs.getDefaultBranch("");
  let seen = null;
  let overrides = Cc["@mozilla.org/file/directory_service;1"]
    .getService(Ci.nsIProperties).get("ProfD", Ci.nsIFile);
  overrides.append("preferences");
  if (overrides.exists() && overrides.isDirectory()) {
    seen = new Set();
    let filter = name => name.startsWith("noscript.") && seen.add(name);
    for (let entries = overrides.directoryEntries, file; (file = entries.getNext()) instanceof Ci.nsIFile;) {
      if (file.path.endsWith(".js")) {
        loadPrefs(branch, file, filter);
      }
    }
  }
  let filter = seen && seen.size ? name => !seen.has(name) : null;
  loadPrefs(branch, `${xpiURI}/defaults/preferences/noscript.js`, filter);
}

function startup(addonData, browserStartup) {

  loadDefaultPrefs(addonData.resourceURI.spec);

  INCLUDE("Main");
  Main.bootstrap();


  Main.init();
  if (Main.webExt && addonData.webExtension) {
    Main.webExt.init(addonData.webExtension);
  }
  Main.checkVersion();
}

function shutdown(addonData) {
  if (CustomizableUI && widgetTemplate) {
    try {
        CustomizableUI.destroyWidget(widgetTemplate.id);
    } catch (e) {
    }
  }
  Main.shutdown();
  UNLOAD_ALL();
}


try {
  Cu.import("resource:///modules/CustomizableUI.jsm");
} catch(e) {
  var CustomizableUI = null;
}
var widgetTemplate = null;
var overlayURL = NO_CACHE(`noscriptOverlay-noStatusBar.xul`);

function createWidgetTemplate(window, callback) {
  let xhr = new window.XMLHttpRequest();
  if (window.document.getElementById("status-bar")) {
    overlayURL = overlayURL.replace("-noStatusBar", "");
  }
  xhr.open("GET", overlayURL);

  try {
    // work around to resolve overlay's XML entities despite the Tor Browser
    let TOR_PREF = "extensions.torbutton.resource_and_chrome_uri_fingerprinting";
    let torPrefValue = Services.prefs.getBoolPref(TOR_PREF);
    let restorePref = () => Services.prefs.setBoolPref(TOR_PREF, torPrefValue);
    for (let e of ["progress", "loadend"]) { // restore as early as possible (almost sync)
      xhr.addEventListener(e, restorePref);
    }
    xhr.addEventListener("loadstart", () => {
      Services.prefs.setBoolPref(TOR_PREF, true);
    });
  } catch (e) {
    // no pref value, it doesn't seem to be a Tor Browser :)
  }
  
  xhr.addEventListener("load", () => {
    createWidget(xhr.responseXML.getElementById("noscript-tbb"));
    if (callback) callback();
  });

  
  xhr.send(null);
}

function createWidget(template) {
  widgetTemplate = template;
  if (CustomizableUI) {
    CustomizableUI.createWidget({
      id: widgetTemplate.id,
      type: "custom",
      onBuild(doc) {
        return doc.importNode(widgetTemplate);
      },
      onCreated(node) {
        let noscriptOverlay = node.ownerDocument.defaultView.noscriptOverlay;
        if (noscriptOverlay) node.ownerDocument.defaultView.noscriptOverlay.initPopups();
      }
    });
  }
}


function placeWidgetNoAustralis(document) {
  let id = widgetTemplate.id;
  let widget = document.getElementById(id) || document.importNode(widgetTemplate);
  if (widget.parentNode) return;
  let toolbar = document.querySelector(`toolbar[currentset*="${id}"],toolbar[currentset*=",${id},"],toolbar[currentset^="${id},"],toolbar[currentset=",${id}"]`);
  if (toolbar) {
    let currentSet = toolbar.getAttribute("currentset");
    if (toolbar.currentSet !== currentSet) {
      toolbar.currentSet = currentSet;
      try {
        document.defaultView.BrowserToolboxCustomizeDone(true);
      } catch (e) {}
    }
    let items = currentSet.split(",");
    let next = items.indexOf(id) + 1;
    let nextNode = next > items.length ? null : document.getElementById(items[next]);
    toolbar.insertBefore(widget, nextNode);
  } else {
    toolbar = document.querySelector("toolbar");
    if (toolbar && toolbar.toolbox && toolbar.toolbox.palette) {
      toolbar.toolbox.palette.appendChild(widget);
    }
  }
}

var overlayLoading = false;
var overlayQueue = [];
var overlaid = new WeakSet();
function overlayNext() {
  overlayLoading = false;
  if (overlayQueue.length) {
    let next = overlayQueue.shift();
    Thread.asap(() => loadIntoWindow(next));
  }
}
function loadIntoWindow(w, early = false) {
  if (w.noscriptOverlay || typeof overlayQueue === "undefined") return;

  if (overlayLoading) {
    overlayQueue.push(w);
    return;
  }
  overlayLoading = true;
  
  if (!widgetTemplate) {
    createWidgetTemplate(w, () => {
      overlayLoading = false;
      loadIntoWindow(w);
    });
    return;
  }
  
  try {
    if (overlaid.has(w)) {
      overlayNext();
      return;
    }
    overlaid.add(w);  
    w.document.loadOverlay(overlayURL, {
      observe() {
        if (!early) {
          if (CustomizableUI) {
            let widget = w.document.getElementById(widgetTemplate.id);
            if (widget) widget.hidden = false;
            else {
              Main.dump(`${widgetTemplate.id} not found!`);
              CustomizableUI.ensureWidgetPlacedInWindow(widgetTemplate.id, w);
            }
          } else {
            placeWidgetNoAustralis(w.document);
          }
          
          (function initWindow() {
              if (w.noscriptOverlay) {
                w.noscriptOverlay.listeners.onLoad();
              } else {
                w.setTimeout(initWindow, 300);
              }
          })();
        }
        Main.dump(`Overlay loaded ${early}, ${w.noscriptOverlay}`);
        overlayNext();
      }
    });
  } catch (e) {
    Cu.reportError(e);
    Cu.reportError(`Could not overlay ${w.location.href}`);
    overlayNext();
  }

}


function unloadFromWindow(w) {
  if (w.noscriptOverlay) w.noscriptOverlay.listeners.onUnload();
}

