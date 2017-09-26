var EXPORTED_SYMBOLS = ["startup", "shutdown", "upgrade", "loadIntoWindow", "unloadFromWindow"];
var { utils: Cu, interfaces: Ci } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import(`chrome://noscript/content/importer.jsm`);

Services.scriptloader.loadSubScript(NO_CACHE("loader.js"), this);

function loadDefaultPrefs(xpiURI, fileName) {
  try {
      let prefURI = xpiURI.spec + "/defaults/preferences/" + fileName;
      let branch = Services.prefs.getDefaultBranch("");
      Services.scriptloader.loadSubScript(prefURI, {
        Cc,
        Ci,
        pref(name, value) {
            try {
              switch (typeof value) {
                  case "boolean":
                      branch.setBoolPref(name, value);
                      break;

                  case "number":
                      branch.setIntPref(name, value);
                      break;

                  case "string":
                      var str = Cc["@mozilla.org/supports-string;1"].createInstance(Ci.nsISupportsString);
                      str.data = value;
                      branch.setComplexValue(name, Ci.nsISupportsString, str);
                      break;
              }
            } catch (e) {
                Cu.reportError(`NoScript could not set default pref value for ${name}: ${e}`);
            }
        }
      });
  } catch (err) {
      Cu.reportError(err);
  }
}

function startup(addonData) {
  loadDefaultPrefs(addonData.resourceURI, "noscript.js");
  INCLUDE("Main");
  Main.bootstrap();
  Main.init();
  createWidgetTemplate();
}

function shutdown(addonData) {
  if (CustomizableUI && widgetTemplate) {
    CustomizableUI.destroyWidget(widgetTemplate.id);
  }
  Main.shutdown();
  UNLOAD_ALL();
}

function upgrade(addonData) {
  Main.checkVersion();
}

try {
  Cu.import("resource:///modules/CustomizableUI.jsm");
} catch(e) {
  var CustomizableUI = null;
}
var widgetTemplate = null;
const OVERLAY_URL = NO_CACHE("noscriptOverlayFx57.xul");

function createWidgetTemplate() {
  let xhr = Cc["@mozilla.org/xmlextras/xmlhttprequest;1"]
              .createInstance(Ci.nsIXMLHttpRequest);
  xhr.open("GET", OVERLAY_URL);
  
  xhr.addEventListener("load", r => {
    createWidget(xhr.responseXML.getElementById("noscript-tbb"));
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
function loadIntoWindow(w, early = false) {
  if (w.noscriptOverlay) return;
  if (overlayLoading) {
    overlayQueue.push(w);
    return;
  }
  overlayLoading = true;
  try {
    w.document.loadOverlay(OVERLAY_URL, {
      observe() {
        if (!early) {
          if (CustomizableUI) {
            CustomizableUI.ensureWidgetPlacedInWindow(widgetTemplate.id, w);
            let widget = w.document.getElementById(widgetTemplate.id);
            if (widget) widget.hidden = false;
            else {
              Main.log(`${widgetTemplate.id} not found!`);
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
        overlayLoading = false;
        if (overlayQueue.length) {
          loadIntoWindow(overlayQueue.shift());
        }
      }
    });
  } catch (e) {
    Cu.reportError(e);
    overlayLoading = false;
  }

}


function unloadFromWindow(w) {
  if (w.noscriptOverlay) w.noscriptOverlay.listeners.onUnload();
}

