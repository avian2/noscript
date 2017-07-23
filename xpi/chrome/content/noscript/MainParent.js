Main.OBSERVED_TOPICS.push("http-on-opening-request", "http-on-modify-request");
LAZY_INCLUDE("IO");

var MainParent = {
  beforeInit: function() {
    this._initE10s();
  },
  afterInit: function() {
    if ((this.locked = this.prefs.prefIsLocked("default"))) {
      try {
        const psKey = this.POLICY_NAME + ".sites";
        const dc = this.defaultCaps;
        dc.lockPref("policynames");
        dc.unlockPref(psKey);
        this.resetDefaultSitePrefs();
        dc.setCharPref(psKey, this.policyPB.getCharPref("sites"));
        dc.lockPref(psKey);
        if (dc instanceof PBI) dc.addObserver("default.javascript.", this, true);
        dc.setCharPref("default.javascript.enabled", "noAccess");
        dc.lockPref("default.javascript.enabled");
        this.prefs.lockPref("global");
      } catch(e) {
        this.dump(e);
      }
    }
    
    this.eraseTemp();

    Thread.delay(this.checkSubscriptions, 10000, this);

    this._updateSync();

    this.reloadWhereNeeded(this.RELOAD_NO); // init snapshots

    if (this.getPref("webext.enabled")) { // experimental, only in dev builds for now
      INCLUDE("WebExt");
      this.webExt = WebExt;
    }
  },
  webExt: null,

   _initE10s: function() {
    INCLUDE("e10sParent");
    this.onDisposal(() => { if (IPC.parent) IPC.parent.dispose(); });
  },

  "http-on-modify-request": {
    observe: function(channel, topic, data) {
      try {
        if (channel instanceof Ci.nsIHttpChannel) {

          if (channel.status) {
            if (ns.consoleDump)
              ns.dump("Unexpected! HTTP observer called on aborted channel " +
                        channel.name + " (0x" + channel.status.toString(16) + ") - " +
                        new Error().stack);
            return;
          }

          let ncb = channel.notificationCallbacks;
          let loadFlags = channel.loadFlags;
          if (!(loadFlags || ncb || channel.owner)) {
            try {
              if (channel.getRequestHeader("Content-type") == "application/ocsp-request") {
                if (ns.consoleDump) ns.dump("Skipping cross-site checks for OCSP request " + channel.name);
                return;
              }
            } catch(e) {}
          }

          if (ncb) {
            const IBCL = Ci.nsIBadCertListener2;
            let bgReq = ncb instanceof Ci.nsIXMLHttpRequest || ncb instanceof IBCL
              || ("responseXML" in ncb); // for some reason, since Gecko 15 (new XMLHttpRequest() instanceof Ci.nsIXMLHttpRequest) === false
            if (!bgReq) try { bgReq = ncb.getInterface(IBCL); } catch (e) {}
            if (bgReq && !ns.isCheckedChannel(channel)) {
                if (ns.consoleDump) {
                  ns.dump("Skipping cross-site checks for chrome background request " + channel.name + ", " + loadFlags + ", " + channel.owner);
                }
                return;
            }
          }

          let abeReq = ns.requestWatchdog.onHttpStart(channel);
        }

      } catch (e) {
        ns.dump(e + "\n" + e.stack);
      }
    }
  },

  firstRun: false,
  versionChecked: false,
  checkVersion: function() {
    if (this.versionChecked) return;
    this.versionChecked = true;

    if (!this.getPref("visibleUIChecked", false) && this.ensureUIVisibility())
      this.setPref("visibleUIChecked", true);

    const ver =  this.VERSION;
    const prevVer = this.getPref("version", "");

    if ((this.firstRun = prevVer != ver)) {
      if (prevVer) try {
        this.onVersionChanged(prevVer);
      } catch (ex) {
        Cu.reportError(ex);
      }
      this.setPref("version", ver);
      this.savePrefs();
      const betaRx = /(?:a|alpha|b|beta|pre|rc)\d*$/; // see http://viewvc.svn.mozilla.org/vc/addons/trunk/site/app/config/constants.php?view=markup#l431
      if (prevVer.replace(betaRx, "") != ver.replace(betaRx, "")) {
        if (this.getPref("firstRunRedirection", true)) {
          const name = "noscript";
          const domain = name.toLowerCase() + ".net";

          IOUtil.newChannel("https://" + domain + "/-", null, null).asyncOpen({ // DNS prefetch
            onStartRequest: function() {},
            onStopRequest: function(req, ctx) {
              if (req.status && req.status !== NS_BINDING_REDIRECTED) {
                ns.setPref("version", '');
                ns.savePrefs();
                return;
              }

              var browser = DOM.mostRecentBrowserWindow.getBrowser();
              if (typeof(browser.addTab) != "function") return;


              var url = "https://" + domain + "/?ver=" + ver;
              var hh = "X-IA-Post-Install: " + name + " " + ver;
              if (prevVer) {
                url += "&prev=" + prevVer;
                hh += "; updatedFrom=" + prevVer;
              }
              hh += "\r\n";

              var hs = Cc["@mozilla.org/io/string-input-stream;1"] .createInstance(Ci.nsIStringInputStream);
              hs.setData(hh, hh.length);
              hs.seek(0, 0);

              var b = (browser.selectedTab = browser.addTab()).linkedBrowser;
              b.stop();
              b.webNavigation.loadURI(url, Ci.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, hs);

            },
            onDataAvailable: function() {}
          }, {});
        }
      }
    }
  },

  checkSubscriptions: function() {
    var lastCheck = this.getPref("subscription.last_check");
    var checkInterval = this.getPref("subscription.checkInterval", 24) * 60000;
    var now = Date.now();
    if (lastCheck + checkInterval > now) {
      this.delayExec(this.checkSubscriptions, lastCheck + checkInterval - now + 1000);
      return;
    }

    function load(list, process, goOn) {
      var url = ns.getPref("subscription." + list + "URL");
      if (!url) {
        goOn();
        return;
      }
      var xhr = ns.createCheckedXHR("GET", url, function() {
        if (xhr.readyState === 4) {
          if (xhr.status === 0 || xhr.status === 200) {
            var lists = xhr.responseText.split("[UNTRUSTED]");
            try {
              process(lists[0], lists[1]);
              ns.dump(list + " list at " + url + " loaded.");
            } catch(e) {
              ns.dump(e);
            }
          }
          goOn();
        }
      });
      xhr.send(null);
    }

    load("untrusted",
      function(trusted, untrusted) {
        ns.untrustedSites.sitesString += " " + untrusted;
        ns.persistUntrusted();
      },
      function() {
        load("trusted", function(trusted, untrusted) {
          var trustedSites = new PolicySites(trusted);
          trustedSites.remove(ns.untrustedSites.sitesList, true, false);
          ns.flushCAPS(ns.jsPolicySites.sitesString + " " + trustedSites.sitesString);
        }, function() {
          ns.setPref("subscription.lastCheck", Date.now());
          ns.savePrefs(true);
          ns.delayExec(ns.checkSubscriptions, checkInterval);
        });
      }
    );
  },

  get builtInSync() {
    var ret = false;
    try {
      ret = this.prefService.getDefaultBranch("services.sync.prefs.sync.javascript.").getBoolPref("enabled");
    } catch (e) {}
    delete this.builtInSync;
    return (this.builtInSync = ret);
  },

  _updateSync: function() {
    let t = Date.now();
    this._clearSync();
    if (this.builtInSync && this.getPref("sync.enabled")) this._initSync();
    if (this.consoleDump) this.dump("Sync prefs inited in " + (Date.now() - t));
  },
  _initSync: function() {

    try {
      let branch = this.prefService.getDefaultBranch("services.sync.prefs.sync.noscript.");
      for (let key  of this.prefs.getChildList("", {})) {
        switch (key) {
          case "version":
          case "preset":
          case "placesPrefs.ts":
          case "mandatory":
          case "default":
          case "ABE.wanIpAsLocal":
          case "ABE.migration":
          case "sync.enabled":
            break;
          default:
            branch.setBoolPref(key, true);
        }
      }
      this.prefService.getDefaultBranch("services.sync.prefs.sync.")
        .setBoolPref(this.policyPB.root + "sites", true);
    } catch(e) {
      this.dump(e);
    }

  },
  _clearSync: function() {
    try {
      this.prefService.getBranch("services.sync.prefs.sync.noscript.").deleteBranch("");
    } catch(e) {
      this.dump(e);
    }
    try{
      this.prefService.getBranch("services.sync.prefs.sync." + this.policyPB.root).deleteBranch("");
    } catch(e) {
      this.dump(e);
    }
  },

   _dontSerialize: ["version", "temp", "preset", "placesPrefs.ts", "mandatory", "default"],

  conf2JSON() {
    const exclude = this._dontSerialize;
    const prefs = {};
    for (let key  of this.prefs.getChildList("", {})) {
      if (exclude.indexOf(key) === -1) {
        prefs[key] = this.getPref(key);
      }
    }
    return {
      prefs: prefs,
      whitelist: this.getPermanentSites().sitesString,
      V: this.VERSION
    };
  },

  serializeConf: function(beauty) {
    const conf = JSON.stringify(this.conf2JSON());
    return beauty ? conf.replace(/([^\\]"[^"]*[,\{])"/g, "$1\r\n\"").replace(/},?(?:\n|$)/g, "\r\n$&") : conf;
  },

  restoreConf: function(s) {
    try {
      const json = JSON.parse(s.replace(/[\n\r]/g, ''));
      if (json.ABE) ABE.restoreJSONRules(json.ABE);

      const prefs = json.prefs;
      const exclude = this._dontSerialize;
      for (let key in prefs) {
        if (exclude.indexOf(key) === -1) {
          this.setPref(key, prefs[key]);
        }
      }

      if (prefs.global != ns.jsEnabled) ns.jsEnabled = prefs.global;

      this.flushCAPS(json.whitelist);
      this.setPref("temp", "");
      this.setPref("gtemp", "");

      return true;
    } catch(e) {
      this.dump("Cannot restore configuration: " + e);
      return false;
    }
  },

  applyPreset: function(preset) {

    this.resetDefaultPrefs(this.prefs, ['version', 'temp', 'untrusted', 'preset']);

    switch(preset) {
      case "off":
        this.setPref("ABE.enabled", false);
        this.setPref("filterXGet", false);
        this.setPref("filterXPost", false);
        this.setPref("clearClick", 0);
      case "low":
        this.jsEnabled = true;
      break;
      case "high":
        this.setPref("contentBlocker", true);
      case "medium":
        this.jsEnabled = false;
      break;
      default:
        return;
    }

    this.setPref("preset", preset);
    this.savePrefs();
  },

  _sound: null,
  playSound: function(url, force) {
    if (force || this.getPref("sound", false)) {
      var sound = this._sound;
      if (sound === null) {
        sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
        sound.init();
        this._sound = sound;
      }
      try {
        sound.play(IOS.newURI(url, null, null));
      } catch(ex) {
        //dump(ex);
      }
    }
  },

  _soundNotified: {},
  soundNotify: function(url) {
    if (this.getPref("sound.oncePerSite", true)) {
      const site = this.getSite(url);
      if (this._soundNotified[site]) return;
      this._soundNotified[site] = true;
    }
    this.playSound(this.getPref("sound.block"));
  },

  readFile: function(file) {
    return IO.readFile(file);
  },
  writeFile: function(file, content) {
    IO.writeFile(file, content);
  },

   cleanupBrowser: function(browser) {
    delete browser.__noscriptStorage;
  },

  _snapshot: {
    lastTrusted: "",
    lastUntrusted: "",
    lastGlobal: false,
    lastObjects: "{}",
  },

  updateSnapshot() {
    const trusted = this.jsPolicySites.sitesString;
    const untrusted = this.untrustedSites.sitesString;
    const global = this.jsEnabled;
    const objects = JSON.stringify(this.objectWhitelist);
    let snapshot = this._snapshot;
    this._snapshot = {
      lastGlobal: global,
      lastTrusted: trusted,
      lastUntrusted: untrusted,
      lastObjects: objects,
    };

    snapshot.changed = !(!snapshot.lastTrusted ||
        global === snapshot.lastGlobal &&
        snapshot.lastObjects === objects &&
        trusted === snapshot.lastTrusted &&
        untrusted === snapshot.lastUntrusted
       );

    return snapshot;
  },

  reloadAllowedObjects: function(browser, mime) {
    browser.messageManager.sendAsyncMessage("NoScript:reloadAllowedObjects", {mime});
  },

  reloadWhereNeeded: function(reloadPolicy = this.RELOAD_ALL, snapshot = this.updateSnapshot()) {
    if (!snapshot.changed) {
      return;
    }

    const currentTabOnly = !this.getPref("autoReload.allTabs") ||
        this.jsEnabled != snapshot.lastGlobal && !this.getPref("autoReload.allTabsOnGlobal");
    if (currentTabOnly && reloadPolicy === this.RELOAD_ALL) {
      reloadPolicy = this.RELOAD_CURRENT;
    }
    let payload = {
      snapshots: {
        previous: snapshot,
        current: this._snapshot,
        timestamp: Date.now(),
      },
      reloadPolicy,
      mustReload: !(
        reloadPolicy === this.RELOAD_NO ||
        !this.getPref("autoReload") ||
        snapshot.lastGlobal !== this._snapshot.lastGlobal && !this.getPref("autoReload.global")
      ),
    };
    try {
      let browser = DOM.mostRecentBrowserWindow.noscriptOverlay.currentBrowser;
      payload.innerWindowID = browser.innerWindowID;
    } catch (e) {}
    
    Services.mm.broadcastAsyncMessage("NoScript:reload", payload);

  },

  purgeRecent() {
    this.recentlyBlocked = [];
    Services.mm.broadcastAsyncMessage("NoScript:purgeRecent", null);
  },
};

