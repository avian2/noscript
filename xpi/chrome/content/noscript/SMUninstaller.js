var SMUninstaller = {
  log: function(msg) {
    dump("[" + EXTENSION_NAME + "] " + msg + "\n");
  },
  
  check: function() {
    this._uninstall("UChrm", EXTENSION_NAME + " Installation",
      EXTENSION_NAME + " detected a previous installation inside your profile and removed it.\n" +
      "SeaMonkey is being closed again to complete the installation process.\n" +
      EXTENSION_NAME +  " will be available as soon as you restart SeaMonkey.");
  },
  
  prompter: CC["@mozilla.org/embedcomp/prompt-service;1"
            ].getService(CI.nsIPromptService),
  
  appUninstall: function(window) {
    if (this.prompter.confirm(window, "Uninstalling " + EXTENSION_NAME,
      "Are you sure you want to uninstall " + EXTENSION_NAME +
      "?\n(SeaMonkey will need to be closed)")) {
      this._uninstall("AChrom", EXTENSION_NAME + " Uninstalled", "SeaMonkey is about to be closed.\nWhen you restart it, " +
                     EXTENSION_NAME + " will be gone.");
      if (window) window.close();
    }
  },
  
  _uninstall: function(dir, title, message) {
    
    try {
      var pChrome = CC["@mozilla.org/file/directory_service;1"].getService(CI.nsIProperties).get(dir, CI.nsIFile).clone();
      
      pChrome.append("chrome.rdf");
      var chromeReg = IO.readFile(pChrome);
      
      var dirty = new RegExp('<RDF:Description RDF:about="urn:mozilla:package:' + CHROME_NAME + '"[^>]*c:extension="true"').test(chromeReg);
      if (!dirty) return;
      var rx = new RegExp('<RDF:Description RDF:about="urn:mozilla:[^"]+:' + CHROME_NAME +
          '"[\\s\\S]*?</RDF:Description>|<RDF:li RDF:resource="urn:mozilla:[^"]+:' + CHROME_NAME + '"/>',
        'g');
      this.log("Removing " + rx.source + " in " + pChrome.path);
      chromeReg = chromeReg.replace(rx, '');
    } catch(e) {
      this.log(e);
    }
    
    
    var self = this;

    CC['@mozilla.org/observer-service;1'].getService(CI.nsIObserverService)
        .notifyObservers(CC["@mozilla.org/chrome/chrome-registry;1"]
                       .getService(CI.nsIChromeRegistrySea),
                       "chrome-flush-caches", null);

    singleton.delayExec(function() {
      try {
       
        var appStartup = CC["@mozilla.org/toolkit/app-startup;1"].getService(CI.nsIAppStartup);
        
         
        self.log("Patching the chrome registry");
        IO.safeWriteFile(pChrome, chromeReg);
        
        var rx = new RegExp('<RDF:li>chrome://' + CHROME_NAME + '/[^<]+</RDF:li>', 'g');
        
        ["overlays", "stylesheets"].forEach(function(f) {
          try {
            var cf  = pChrome.parent;
            cf.append(f + ".rdf");
            if (cf.exists()) {
              var content = IO.readFile(cf);
              self.log("Removing " + rx.source + " in " + cf.path);
              var patched = content.replace(rx, '');
              if (content != patched) {
                 self.log("Writing " + patched);
                IO.safeWriteFile(cf, patched);
              }
            }
          } catch(e) {
            self.log("Error patching " + f + ": " + e);
          }
        });
        
        try {
          var jar = pChrome.parent;
          jar.append(CHROME_NAME + ".jar");
          jar.remove(false);
        } catch(e) {}
        
        try {
          var cmp = pChrome.parent.parent;
          cmp.append("components");
          cmp.append(CHROME_NAME + "Service.js");
          cmp.remove(false);
        } catch(e) {}
        
        
        
        var offline = IOS.offline;
        IOS.offline = true;
        
        var window = DOM.mostRecentBrowserWindow;
        self.prompter.alert(
            window, title, message
          );
        
       
        
        self.log("Quit");
        
        IOS.offline = offline;
        
        appStartup.quit(appStartup.eForceQuit);
        
      } catch(e) {
        self.log(e);
      }
    
    }, 10);
  }
}
singleton.smUninstaller = SMUninstaller;