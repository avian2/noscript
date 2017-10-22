var { utils: Cu, interfaces: Ci } = Components;

Cu.import("resource://gre/modules/Services.jsm");

let moduleURL = `chrome://noscript/content/Restartless.jsm?${Math.random() }.${Date.now()}`;
let customizeStyle = "chrome://noscript/skin/browser.css";
let module = {};

function startup(data, reason) {
    Cu.import(moduleURL, module);
    module.startup(data, reason === APP_STARTUP);  // Do whatever initial startup stuff you need to do

    if (module.loadIntoWindow) {
      forEachOpenWindow(module.loadIntoWindow);
    }
    Services.wm.addListener(WindowListener);
}

function shutdown(data, reason) {
    if (reason === APP_SHUTDOWN)
        return;

    Services.wm.removeListener(WindowListener);

    if (module.unloadFromWindow) forEachOpenWindow(module.unloadFromWindow);


    module.shutdown(data); 

    Cu.unload(moduleURL); 
    Services.obs.notifyObservers(null, "chrome-flush-caches", null);
}
function install(data, reason) { }
function uninstall(data, reason) { }

function forEachOpenWindow(todo)  // Apply a function to all open browser windows
{
    var windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements())
        todo(windows.getNext().QueryInterface(Ci.nsIDOMWindow));
}
var WindowListener =
{
    onOpenWindow: function(xulWindow)
    {
        var window = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                              .getInterface(Ci.nsIDOMWindow);
        function onWindowLoad()
        {
            window.removeEventListener("DOMContentLoad",onWindowLoad);
            let doc = window.document;
            if (doc.documentElement.getAttribute("windowtype") == "navigator:browser") {
                module.loadIntoWindow(window, true);
            } else if(window.location.href === "chrome://global/content/customizeToolbar.xul") {
                let root = doc.documentElement;
                let styleNode = doc.createProcessingInstruction("xml-stylesheet",`href="${customizeStyle}" type="text/css"`);
                doc.insertBefore(styleNode, root);
            }
        }
        window.addEventListener("DOMContentLoaded", onWindowLoad);
    },
    onCloseWindow: function(xulWindow) { },
    onWindowTitleChange: function(xulWindow, newTitle) { }
};
