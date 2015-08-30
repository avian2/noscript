var PolicyState = {
  hintsList: [],
  checking: [],
  addCheck: function(url) {
    if (typeof Map === "function") {
      this.checking = new Map(),
      this.addCheck = function(url) { this.checking.set(url, true); }
      this.removeCheck = function(url) { this.checking.delete(url); }
      PolicyState.isChecking = function(url) this.checking.has(url);
    } else {
      this.addCheck = function(url) {
        if (this.checking.indexOf(url) === -1)
          this.checking.push(url);
      }
    }
    this.addCheck(url);
  },

  removeCheck: function(url) {
    let idx = this.checking.indexOf(url);
    if (idx !== -1) this.checking.splice(idx, 1);
  },
  isChecking: function(url) {
    return this.checking.indexOf(url) !== -1;
  },

  hintsForURI: function(uri, clear) {
    let hl = this.hintsList;
    let spec = uri.spec;

    for (let j = hl.length; j--;) {
      let h = hl[j];
      if (h.URISpec !== spec)  continue;
      try {
        if (h.URIRef.get() === uri) {
          if (clear) hl.splice(j, 1);
          return h;
        }
      } catch(e) {
      }
    }
    return null;
  },

  attach: function(channel) {
    let uri = channel.URI;
    if (this.extract(channel) ||
        !(uri.schemeIs("http") || uri.schemeIs("https")))
      return;

    let hints = this.hintsForURI(uri, true) || uri !== channel.originalURI && this.hintsForURI(channel.originalURI, true);
    if (hints) {
      hints._attached = true;
      if (hints.contentType === 6) {
        let origin = hints.requestOrigin;
        if (origin && origin.schemeIs("moz-nullprincipal")) {
          if (/\n(?:handleCommand@chrome:\/\/[\w/-]+\/urlbarBindings\.xml|.*?@chrome:\/\/noscript\/content\/noscriptBM\.js)(?::\d+)+\n/
            .test(new Error().stack)) {
            hints.requestOrigin = ABE.BROWSER_URI;
          } else  if (hints.context.docShell) {
            hints.requestOrigin = IOUtil.unwrapURL(hints.context.docShell.currentURI);
          }
        }
      }
      IOUtil.attachToChannel(channel, "noscript.policyHints", hints);
    } else {
      // if (!this.extract(channel)) ns.log("Missing hints for " + channel.name + ", " + channel.status + ", " + channel.loadFlags);
    }
  }
,
  extract: function(channel, detach) IOUtil.extractFromChannel(channel, "noscript.policyHints", !detach)
,
  detach: function(channel) {
    let uri = channel.URI;
    if (!(uri.schemeIs("http") || uri.schemeIs("https"))) return null;
    let hints = this.extract(channel, true);
    if (!hints) this.reset(uri);
    return hints;
  }
,
  reset: function(uri) {
    if (uri) this.hintsForURI(uri, true);
    else this.sweep();
  },
  cancel: function(hints) {
    hints._psCancelled = true;
  },

  SWEEP_COUNTDOWN: 1000,
  _sweepCount: 1000,
  save: function(uri, hints) {

    if ("_psCancelled" in hints) return false;

    this.hintsList.push(new PolicyHints(uri, hints));

    if (this._sweepCount-- < 0) this.sweep();
    return true;
  },

  sweep: function() {
    this._sweepCount = this.SWEEP_COUNTDOWN;
    let hl = this.hintsList;
    for (let j = hl.length; j--;) {
      let u;
      try {
        u = hl[j].URIRef.get();
      } catch(e) {
        u = null;
      }
      if (!u) hl.splice(j, 1);
    }
  },

  toString: function() {
    return "PolicyState: " + this.hintsList.map(function(h) h.URISpec + " - " + h.URIRef.get()).toSource()
  }
}

function PolicyHints(uri, hints) {
  this.args = hints;
  if (hints[1] === uri) {
    hints[1] = uri.clone(); // avoid cyclic references
    if (hints[2] === uri) {
      hints[2] = hints[1];
    }
  }
  this.context = hints[3]; // turns it into a weak reference
  this.URIRef = Cu.getWeakReference(uri);
  this.URISpec = uri.spec; // for fast lookups
}

PolicyHints.prototype = (function() {
  const props = ["contentType", "contentLocation", "requestOrigin", "context", "mimeType", "extra", "owner"];
  const proto = {
    get wrappedJSObject() this,
    toArray: function() props.map(function(p) this[p], this),
    toSource: Object.prototype.toSource,
    toString:  Object.prototype.toSource
  };
  props.forEach(function(p, i) {
    this.__defineGetter__(p, function() this.args[i]);
    switch(p) {
      case "context":
        this.__defineSetter__(p,
        function(v) {
          try {
            v =  v ? Cu.getWeakReference(v) : null;
          } catch (e) {
            v = null;
          }
          if (v) {
            this.__defineGetter__(i, function() { try { return v.get() } catch (e) {} return null } );
          } else {
            this.args[i] = v;
          }
        });
        break;
      default:
        this.__defineSetter__(p, function(v) this.args[i] = v);
    }
   }, proto);
   return proto;
})();

const NOPContentPolicy = {
  shouldLoad: CP_NOP,
  shouldProcess: CP_NOP
};


// nsIContentPolicy interface
// we use numeric constants for performance sake:
// TYPE_OTHER = 1
// TYPE_SCRIPT = 2
// TYPE_IMAGE = 3
// TYPE_STYLESHEET = 4
// TYPE_OBJECT = 5
// TYPE_DOCUMENT = 6
// TYPE_SUBDOCUMENT = 7
// TYPE_REFRESH = 8
// TYPE_XBL = 9
// TYPE_PING = 10
// TYPE_XMLHTTPREQUEST = 11
// TYPE_OBJECT_SUBREQUEST = 12
// TYPE_DTD = 13
// TYPE_FONT = 14
// TYPE_MEDIA = 15
// TYPE_WEBSOCKET = 16
// TYPE_CSP_REPORT = 17
// TYPE_XSLT = 18
// TYPE_BEACON = 19
// ACCEPT = 1


const MainContentPolicy = {
  shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall, principal) {
    if (!aContentLocation) {
      if (aContentType === 5 && aInternalCall === CP_SHOULDPROCESS && aMimeTypeGuess === "application/x-shockwave-flash")
        return this.reject("Empty Flash object", arguments);
      aContentLocation = aRequestOrigin;
    }
    if (aContentType === 5 && /^application\/x-java\b/i.test(aMimeTypeGuess) &&
        aInternalCall !== CP_OBJECTARC) {
      try {
        let cs = aContext.ownerDocument.characterSet;
        let code, codeBase, archive;

        let pp = aContext.getElementsByTagName("param");
        for (let j = 0, len = pp.length; j < len; j++) {
          let p = pp[j];
          if (p.parentNode == aContext) {
            switch(p.name.toLowerCase()) {
              case "code": code = p.value; break;
              case "codebase": codeBase = p.value; break;
              case "archive": archive = p.value; break;
            }
          }
        }

        if (!code)
          code = aContext.getAttribute("code");

        if (!codeBase)
          codeBase = aContext.getAttribute("codebase") ||
          (aContext instanceof Ci.nsIDOMHTMLAppletElement ? "/" : ".");

        if (!archive)
          archive = aContext.getAttribute("archive");

        try {
          aContentLocation = IOS.newURI(codeBase, cs, aRequestOrigin);
        } catch (e) {}

        if (aContext instanceof Ci.nsIDOMHTMLEmbedElement) {
          code = aContext.getAttribute("code");
          if (code && /\bjava\b/.test(aMimeTypeGuess)) {
            archive = archive ? code + " " + archive : code;
          } else code = '';
        }
        if (archive) {
          let prePaths;
          let base = aContentLocation;
          let jars = archive.split(/[\s,]+/)
          for (let j = jars.length; j-- > 0;) {
            try {
              let jar = jars[j];
              let u = IOS.newURI(jar, cs, base);
              let prePath = u.prePath;
              if (prePath !== base.prePath) {
                if (prePaths) {
                  if (prePaths.indexOf(prePath) !== -1) continue;
                  prePaths.push(prePath);
                } else prePaths = [prePath];
              } else {
                if (j === 0 && code === jar) aContentLocation = u;
                continue;
              }
              this.setExpando(aContext, "allowed", null);
              let res = this.shouldLoad(aContentType, u, aRequestOrigin, aContext, aMimeTypeGuess, CP_OBJECTARC);
              if (res !== CP_OK) return res;
            } catch (e) {
              this.dump(e)
            }
          }
          this.setExpando(aContext, "allowed", null);
        }

        if (code) {
          try {
            if (!/\.class\s*$/i.test(code)) code += ".class";
            aContentLocation = IOS.newURI(code, cs, aContentLocation);
          } catch (e) {}
        }
      } catch (e) {}
    }

    var logIntercept = this.consoleDump, logBlock;

    if(logIntercept) {
      logBlock = logIntercept & LOG_CONTENT_BLOCK;
      logIntercept = logIntercept & LOG_CONTENT_INTERCEPT;
    } else logBlock = false;

    if (!aInternalCall) {
      PolicyState.addCheck(aContentLocation);
    }

    try {

      var originURL, locationURL, originSite, locationSite, scheme,
          forbid, isScript, isJava, isFlash, isSilverlight,
          isLegacyFrame, blockThisFrame, contentDocument,
          unwrappedLocation, mimeKey,
          mustCountObject = false;


      unwrappedLocation = IOUtil.unwrapURL(aContentLocation);
      scheme = unwrappedLocation.scheme;

      if (scheme === "file") {
         principal = principal || aContext && (aContext.nodePrincipal ||
                                      aContext.document && aContext.document.nodePrincipal);
        if (!ns.checkLocalLink(unwrappedLocation, principal, true)) {
          return this.reject("Local File Link", arguments);
        }
      }

      var isHTTP = scheme === "http" || scheme === "https";

      if (isHTTP) {

        // reject any cross-site google-analytics subrequest unless explicitly whitelisted
        if (aContentType !== 2 && aContentType !== 6 &&
            unwrappedLocation.host.indexOf("google-analytics") !== -1 &&
            unwrappedLocation.prePath !== (aRequestOrigin && aRequestOrigin.prePath) &&
            !this.isJSEnabled(this.getSite(unwrappedLocation.spec))
            ) {
          return this.reject("Google Analytics web bug", arguments);
        }

        if (aRequestOrigin &&
            !(aContentType === 4 && Bug.$677643)
            ) {

          HTTPS.forceURI(unwrappedLocation, null, aContext);

          switch(aContentType) {

            case 5:


              // early ABE check for any plugin content except Flash, Silverlight and PDF
              // (Java, for instance, is known to bypass HTTP observers!)
              if (/^application\/(?:x-(?:shockwave-flash|silverlight)$|futuresplash|pdf$)/i.test(aMimeTypeGuess))
                break;

            case 7:
              if (aContext instanceof Ci.nsIDOMHTMLObjectElement) {
                let win = aContext.ownerDocument.defaultView
                if (this.isCachedObjectMime(aMimeTypeGuess) &&
                    !(aContext.offsetWidth && aContext.offsetHeight) &&
                    this.getPref("allowCachingObjects") &&

                    aRequestOrigin && this.isJSEnabled(this.getSite(aRequestOrigin.spec), win) &&
                    !this.pluginForMime(aMimeTypeGuess) &&
                    (aMimeTypeGuess.indexOf("css") > 0 || this.isJSEnabled(this.getSite(aContentLocation.spec), win))
                   ) {
                  return CP_OK;
                }
              }
              if (aContentType === 7 || aInternalCall) break;

            case 1: case 12: // we may have no chance to check later for unknown and sub-plugin requests

              let res = ABE.checkPolicy(aRequestOrigin, unwrappedLocation, aContentType);
              if (res && res.fatal) {
                this.requestWatchdog.notifyABE(res, true);
                return this.reject("ABE-denied inclusion", arguments);
              }
          }
        }

        if (logIntercept && this.cpConsoleFilter.indexOf(aContentType) > -1) {
          this.cpDump("processing", aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall);
          if (this.consoleDump & LOG_CONTENT_CALL)
             this.dump(new Error().stack);
        }

      }

      switch (aContentType) {
        case 9: // XBL - warning, in 1.8.x could also be XMLHttpRequest...
          return this.forbidXBL &&
            this.forbiddenXMLRequest(aRequestOrigin, aContentLocation, aContext, this.forbiddenXBLContext)
            ? this.reject("XBL", arguments) : CP_OK;

        case 11: // in Firefox 3 we check for cross-site XHR
          return this.forbidXHR &&
            this.forbiddenXMLRequest(aRequestOrigin, aContentLocation, aContext, this.forbiddenXHRContext)
             ? this.reject("XHR", arguments) : CP_OK;

        case 10: // TYPE_PING
          if (this.jsEnabled || !this.getPref("noping", true) ||
              aRequestOrigin && this.isJSEnabled(this.getSite(aRequestOrigin.spec))
            )
            return CP_OK;

          return this.reject("Ping", arguments);

         case 17: // CSP report, avoid exfiltration on untrusted resources
          if (this.jsEnabled ||
              this.isJSEnabled(this.getSite(aContentLocation.spec)) &&
              aRequestOrigin && this.isJSEnabled(this.getSite(aRequestOrigin.spec))
            )
            return CP_OK;

          return this.reject("CSP report", arguments);

        case 2:
          forbid = isScript = true;
          break;

        case 4: // STYLESHEETS
          if (PolicyUtil.supportsXSL ||
              !(PolicyUtil.isXSL(aContext) && /\/x[ms]l/.test(aMimeTypeGuess))
             ) return CP_OK;
        case 18: // XSL
          if (!/^(?:chrome|resource)$/.test(aContentLocation.scheme) &&
                this.getPref("forbidXSLT", true)) {
            forbid = isScript = true; // we treat XSLT like scripts
            break;
          }
          return CP_OK;

        case 14: // fonts
          forbid = this.forbidFonts;
          if (!forbid) return CP_OK;
          mimeKey = "FONT";
          if (aContentLocation && aRequestOrigin && aContentLocation.schemeIs("data"))
            locationURL = this.getSite(aRequestOrigin.spec);

          break;

        case 5: // embeds

          if (aContentLocation && aRequestOrigin &&
              (locationURL = aContentLocation.spec) == (originURL = aRequestOrigin.spec) &&
              aMimeTypeGuess) {

            if ((aContext instanceof Ci.nsIDOMHTMLEmbedElement) &&
              this.isAllowedObject(locationURL, aMimeTypeGuess)
              ) {
              if (logIntercept) this.dump("Plugin document " + locationURL);
              return CP_OK; // plugin document, we'll handle it in our webprogress listener
            }

            if (!(aContext.getAttribute("data") || aContext.getAttribute("codebase") || aContext.getAttribute("archive") || aContext.getAttribute("src")
                  || aContext.firstChild) && aMimeTypeGuess == "application/x-shockwave-flash") {
              if (logIntercept) this.dump("Early Flash object manipulation with no source set yet.");
              if (this.anyAllowedObject(this.getSite(locationURL), aMimeTypeGuess))
                return CP_OK;

              this.setExpando(aContext, "requiresReload", true);
            }
          }

          case 15: // media
          if (aContentType === 15) {
              if (aRequestOrigin && !this.isJSEnabled(this.getSite(aRequestOrigin.spec), aContext.ownerDocument.defaultView)) {
              // let's wire poor man's video/audio toggles if JS is disabled and therefore controls are not available
              this.delayExec(function() {
                aContext.addEventListener("click", function(ev) {
                  var media = ev.currentTarget;
                  if (media.paused) media.play();
                  else media.pause();
                }, true);
              }, 0);
            }

            forbid = this.forbidMedia;
            if (!forbid && aMimeTypeGuess) return CP_OK;
          }

          if (aMimeTypeGuess)  // otherwise let's treat it as an iframe
            break;

        case 7:

          locationURL = aContentLocation.spec;
          originURL = aRequestOrigin && aRequestOrigin.spec || "";
          let vsPos = locationURL.indexOf("view-source:");
          if (vsPos !== -1 && vsPos < 7 // includes feed: and pcast: prefixed URLs
              && /^(?:https?|ftp):/.test(originURL))
            return this.reject("Embedded view-source:", arguments);

          if (locationURL === "about:blank" || /^chrome:/.test(locationURL)
            || !originURL && (aContext instanceof Ci.nsIDOMXULElement)  // custom browser like in Stumbleupon discovery window
          ) return CP_OK;

          if (!aMimeTypeGuess) {
            aMimeTypeGuess = this.guessMime(aContentLocation);
            if (logIntercept)
              this.dump("Guessed MIME '" + aMimeTypeGuess + "' for location " + locationURL);
          }

          if (aContentType === 15) {
            if (!aMimeTypeGuess) try {
              aMimeTypeGuess = aContext.tagName.toLowerCase() + "/ogg";
            } catch (e) {}

            if (!forbid) return CP_OK;

            break; // we just need to guess the Mime for video/audio
          }

          if (!(aContext instanceof Ci.nsIDOMXULElement)) {

            isLegacyFrame = aContext instanceof Ci.nsIDOMHTMLFrameElement;

            if (isLegacyFrame
                ? this.forbidFrames || // we shouldn't allow framesets nested inside iframes, because they're just as bad
                                       this.forbidIFrames &&
                                       (aContext.ownerDocument.defaultView.frameElement instanceof Ci.nsIDOMHTMLIFrameElement) &&
                                       this.getPref("forbidMixedFrames", true)
                : this.forbidIFrames || // we use iframes to make placeholders for blocked legacy frames...
                                       this.forbidFrames &&
                                       this.isLegacyFrameReplacement(aContext)
               ) {
                try {
                  contentDocument = aContext.contentDocument;
                } catch(e) {}

                blockThisFrame = (aInternalCall === CP_FRAMECHECK) && !(
                        this.knownFrames.isKnown(locationURL, originSite = this.getSite(originURL)) ||
                      /^(?:chrome|resource|wyciwyg):/.test(locationURL) ||
                      locationURL === this._silverlightInstalledHack ||
                      locationURL === this.compatGNotes ||
                      (
                        originURL
                          ? ( /^(?:chrome|about|resource):/.test(originURL) && originURL !== "about:blank" ||
                             /^(?:data|javascript):/.test(locationURL) &&
                              (contentDocument && (originURL == contentDocument.URL
                                                    || /^(?:data:|javascript:|about:blank$)/.test(contentDocument.URL)
                              ) || this.isFirebugJSURL(locationURL)
                             )
                            )
                          : contentDocument &&
                            this.getSite(contentDocument.URL) == (locationSite = this.getSite(locationURL))
                       )
                  ) && this.forbiddenIFrameContext(originURL || (originURL = aContext.ownerDocument.URL), locationURL);
            }
          }
        case 6:

          if (aRequestOrigin && aRequestOrigin != aContentLocation) {

            if (isHTTP) {

              // external?
              if (aRequestOrigin.schemeIs("chrome") && aContext && aContext.ownerDocument &&
                aContext.ownerDocument.defaultView.isNewToplevel){
                this.requestWatchdog.externalLoad = aContentLocation.spec;
              }

            } else if(scheme === "data" || scheme === "javascript") {

              if (aContext instanceof Ci.nsIDOMXULElement) {
                originURL = originURL || aRequestOrigin.spec;
                if (originURL === "chrome://browser/content/browser.xul") {
                  //code
                  if (this.dropXssProtection) {
                    let stack = new Error().stack.split("\n");
                    for (let j = stack.length; j-- > 0;)
                    if (stack[j].indexOf("onxbldrop([object DragEvent])@chrome://global/content/bindings/browser.xml") === 0) {
                      ns.log('NoScript prevented "' + aContentLocation.spec + '" from being loaded on drop.');
                      return this.reject("Drop XSS", arguments);
                    }
                  }
                } else if (
                  !(aContext.ownerDocument.URL === originURL // Addon-SDK panels
                     || this.isJSEnabled(originSite = this.getSite(originURL)))
                  ) {
                  return this.reject("top level data: URI from forbidden origin", arguments);
                }
              }
              return CP_OK; // JavaScript execution policies will take care of this
            } else if(scheme !== aRequestOrigin.scheme &&
                scheme !== "chrome" && // faster path for common case
                this.isExternalScheme(scheme)) {
              // work-around for bugs 389106 & 389580, escape external protocols
              if (aContentType !== 6 && !aInternalCall &&
                  this.getPref("forbidExtProtSubdocs", true) &&
                  !this.isJSEnabled(originSite = this.getSite(originURL = originURL || aRequestOrigin.spec)) &&
                  (!aContext.contentDocument || aContext.contentDocument.URL != originURL)
                  ) {
                return this.reject("External Protocol Subdocument", arguments);
              }
              if (!this.normalizeExternalURI(aContentLocation)) {
                return this.reject("Invalid External URL", arguments);
              }
            } else if(aContentType === 6 && scheme === "chrome" &&
              this.getPref("lockPrivilegedUI", false) && // block DOMI && Error Console
              /^(?:javascript:|chrome:\/\/(?:global\/content\/console|inspector\/content\/inspector|venkman\/content\/venkman)\.xul)$/
                .test(locationURL)) {
              return this.reject("Locked Privileged UI", arguments);
            }
          }

          if (!(this.forbidSomeContent || this.alwaysBlockUntrustedContent) ||
                !blockThisFrame && (
                  aContext instanceof Ci.nsIDOMXULElement ||
                  !aMimeTypeGuess
                  || aMimeTypeGuess.substring(0, 5) == "text/"
                  || aMimeTypeGuess == "application/xml"
                  || aMimeTypeGuess == "application/xhtml+xml"
                  || aMimeTypeGuess.substring(0, 6) == "image/"
                  || !(this.isMediaType(aMimeTypeGuess) || this.pluginForMime(aMimeTypeGuess))
                )
            ) {

            if (aContext instanceof Ci.nsIDOMElement) {
              // this is alternate to what we do in countObject, since we can't get there
              // this.delayExec(this.opaqueIfNeeded, 0, aContext); // TODO uncomment
            }

            if (logBlock)
              this.dump("Document OK: " + aMimeTypeGuess + "@" + (locationURL || aContentLocation.spec) +
                " --- PGFM: " + this.pluginForMime(aMimeTypeGuess));

            if (aContentLocation.schemeIs("about") && /^about:(?:net|cert)error\?/.test(aContentLocation.spec)) {
              this.handleErrorPage(aContext, aContentLocation);
            }

            return CP_OK;
          }
          break;

        case 12:
          // Silverlight mindless activation scheme :(
          if (!this.forbidSilverlight
              || !this.getExpando(aContext, "silverlight") || this.getExpando(aContext, "allowed"))
            return CP_OK;

          aMimeTypeGuess = "application/x-silverlight";
          break;
        default:
          return CP_OK;
      }


      locationURL = locationURL || aContentLocation.spec;
      locationSite = locationSite || this.getSite(locationURL);

      var untrusted = untrusted || this.isUntrusted(locationSite);

      if(logBlock)
        this.dump("[CP PASS 2] " + aMimeTypeGuess + "*" + locationURL + ", " + aContentType + ", " + aInternalCall);

      if (isScript) {
        // we must guess the right context here, see https://bugzilla.mozilla.org/show_bug.cgi?id=464754
        contentDocument = aContext && aContext.ownerDocument || aContext;

        // we get the embedding document URL explicitly,
        // otherwise on redirection we would get the previous redirected URL
        if (contentDocument) { // XSLT comes with no context sometimes...
          this.getExpando(contentDocument.defaultView.top.document, "codeSites", []).push(locationSite);
          originURL = contentDocument.URL;
        } else {
          originURL = aRequestOrigin && aRequestOrigin.spec;
        }
        originSite = originURL && this.getSite(originURL) || "";
        let httpOrigin = originSite.indexOf("http") === 0;


        let scriptElement;
        if (aContentType === 2) { // "real" JavaScript include
          if (!(this.cascadePermissions || this.globalHttpsWhitelist) &&
              originSite && !this.isJSEnabled(originSite, contentDocument.window) &&
              isHTTP && httpOrigin) {
            // JavaScript-disabled page with script inclusion
            this.syncUI(contentDocument);
            return this.reject("Script inclusion on forbidden page", arguments);
          }

          forbid = !(originSite && locationSite == originSite);
          scriptElement = aContext instanceof Ci.nsIDOMHTMLScriptElement;

          if (forbid && httpOrigin && this.requestWatchdog /* lazy init */) {
            // XSSI protection
            let scriptURL = locationURL;
            if (scriptURL.lastIndexOf('/') === scriptURL.length - 1)
              scriptURL = scriptURL.slice(0, -1); // right trim slash
            let decodedOrigin = InjectionChecker.urlUnescape(aRequestOrigin.spec);
            if ((decodedOrigin.indexOf(scriptURL) > 0 || // don't use 0 b/c on redirections origin == scriptURL
                Entities.convertAll(decodedOrigin).indexOf(scriptURL) > 0) &&
                this.getPref("xss.checkInclusions") &&
                !new AddressMatcher(this.getPref("xss.checkInclusions.exceptions", "")).test(locationURL)
              ) {
              let ds = DOM.getDocShellForWindow(contentDocument.defaultView);
              let ch = ds.currentDocumentChannel;
              let referrerURI = IOUtil.extractInternalReferrer(ch);
              if (referrerURI && referrerURI.scheme.indexOf("http") === 0 &&
                  this.getBaseDomain(referrerURI.host) !== this.getBaseDomain(this.getDomain(originURL))) {
                let msg = "Blocking reflected script inclusion origin XSS from " + referrerURI.spec;
                if (scriptElement) this.log(msg + ": " + locationURL + "\nembedded by\n" + decodedOrigin);
                return this.reject(msg, arguments);
              }
            }
          }
        } else isScript = scriptElement = false;

        if (forbid) {
          let doc = aContext.ownerDocument || aContext;
          let win = doc && doc.defaultView;
          forbid = !this.isJSEnabled(locationSite, win);
          if (forbid && this.ignorePorts && /:\d+$/.test(locationSite))
            forbid = !(this.isJSEnabled(locationSite.replace(/:\d+$/, '')) && this.autoTemp(locationSite));
        }

        if ((untrusted || forbid) && scheme !== "data") {
          if (scriptElement) {
            ScriptSurrogate.replaceScript(aContext);
          }

          this.syncUI(contentDocument);

          return this.reject(isScript ? "Script" : "XSLT", arguments);
        } else {

          if (scriptElement) {

            if (this.executingJSURL(contentDocument.defaultView.top.document) &&
                !this.jsPolicySites.matches(this.getSite(contentDocument.defaultView.location.href))) {
              this.bookmarkletImport(aContext, locationURL);
              return this.reject("Bookmarklet inclusion, already imported synchronously", arguments);
            }

          }

          return CP_OK;
        }
      }

      mimeKey = mimeKey || aMimeTypeGuess || "application/x-unknown";

      if (!(forbid || locationSite === "chrome:")) {

        forbid = blockThisFrame || untrusted && this.alwaysBlockUntrustedContent;
        if (!forbid) {
          if (this.forbidSomeContent && aMimeTypeGuess) {

            forbid =
              (
                (isFlash = /^application\/(?:x-shockwave-flash|futuresplash)/i.test(aMimeTypeGuess)) ||
                (isJava = /^application\/x-java\b/i.test(aMimeTypeGuess)) ||
                (isSilverlight = /^application\/x-silverlight\b/i.test(aMimeTypeGuess))
              ) &&
              isFlash && this.forbidFlash ||
              isJava && this.forbidJava ||
              isSilverlight && this.forbidSilverlight;

            // see http://heasman.blogspot.com/2008/03/defeating-same-origin-policy-part-i.html
            if (isJava && /(?:[^\/\w\.\$\:]|^\s*\/\/)/.test(aContext.getAttribute("code") || "")) {
              return this.reject("Illegal Java code attribute " + aContext.getAttribute("code"), arguments);
            }

            if (isFlash) this.tagWindowlessObject(aContext);

            if (this.isAllowedMime(mimeKey, locationSite)) return CP_OK;

            if (forbid) {

              if (isSilverlight) {
                if (logIntercept) this.dump("Silverlight " + aContentLocation.spec + " " + typeof(aContext) + " " + aContentType + ", " + aInternalCall);

                this.setExpando(aContext, "silverlight", aContentType != 12);

                locationURL = this.resolveSilverlightURL(aRequestOrigin, aContext);
                locationSite = this.getSite(locationURL);
                originURL = aRequestOrigin && aRequestOrigin.spec;

                if(this.isAllowedObject(locationURL, mimeKey, locationSite) ||
                   this.isAllowedObjectByDOM(aContext, locationURL, originURL, mimeKey, locationSite)) {
                  if (logIntercept && forbid) this.dump("Silverlight " + locationURL + " is whitelisted, ALLOW");
                  this.handleClickToPlay(aContext);
                  return CP_OK;
                }
              } else if (isFlash) {
                locationURL = this.addFlashVars(locationURL, aContext);
              }
            } else if ((forbid = this.forbidPlugins && !(isJava || isFlash || isSilverlight))) {
              locationURL = this.addObjectParams(locationURL, aContext);
            }
          }
        } else if (blockThisFrame &&
                   this.isAllowedMime(mimeKey, locationSite) ||
                   this.isAllowedMime("FRAME", locationSite)) {
          return CP_OK;
        }
      } else {
        if (this.isAllowedMime(mimeKey, locationSite)) return CP_OK;
      }

      if (forbid && (!this.contentBlocker || /^resource:/.test(locationSite))) {

        originURL = originURL || (aRequestOrigin && aRequestOrigin.spec);
        originSite = originSite || this.getSite(originURL);

        let win = aContext && (
          aContext.ownerDocument
          ? aContext.ownerDocument.defaultView
          : aContext.document ? aContext : aContext.defaultView
        );

        let jsRx = /^(?:javascript|data):/;

        let originOK = originSite
          ? this.isJSEnabled(originSite, win)
          : jsRx.test(originURL); // if we've got such an origin, parent should be trusted

        if (locationSite && this.checkShorthands(locationSite)) this.autoTemp(locationSite);

        let locationOK = locationSite
              ? this.isJSEnabled(locationSite, win)
              : jsRx.test(locationURL) && originOK // use origin for javascript: or data:
        ;

        forbid = !(locationOK && (originOK ||
          !this.getPref(blockThisFrame
            ? "forbidIFramesParentTrustCheck" : "forbidActiveContentParentTrustCheck",
            true)
          ));
      }

      mustCountObject = true;

      if (forbid) forbid = !(aContentLocation.schemeIs("file") && aRequestOrigin && aRequestOrigin.schemeIs("resource")); // fire.fm work around

      if (forbid && this.cascadePermissions && !this.contentBlocker) {
        let principal = aContext.ownerDocument && aContext.ownerDocument.defaultView.top.document.nodePrincipal;
        forbid = untrusted || !this.isJSEnabled(this.getSite(principal.origin), aContext.ownerDocument.defaultView);
      }

      if (forbid) {

        if (!originSite) originSite = this.getSite(originURL || (originURL = aRequestOrigin && aRequestOrigin.spec || ""));

        if (isJava && originSite && /^data:application\/x-java\b/.test(locationURL) ||
            aContentType === 15 && locationURL === "data:,") {
          locationURL = locationSite = originSite;
        }

        try {  // moved here because of http://forums.mozillazine.org/viewtopic.php?p=3173367#3173367
          if (this.getExpando(aContext, "allowed") ||
            this.isAllowedObject(locationURL, mimeKey, locationSite, originSite) ||
            this.isAllowedObjectByDOM(aContext, locationURL, originURL, mimeKey, locationSite, originSite)
            ) {
            this.setExpando(aContext, "allowed", true);
            this.handleClickToPlay(aContext);
            return CP_OK; // forceAllow
          }
        } catch(ex) {
          this.dump("Error checking plugin per-object permissions:" + ex);
        }

        if (isLegacyFrame) { // inject an embed and defer to load
          if (blockThisFrame && this.blockLegacyFrame(aContext, aContentLocation, true))
            return this.reject("Deferred Legacy Frame " + locationURL, arguments);
        } else {
          try {
            if ((aContentType === 5 || aContentType === 7 || aContentType === 12 || aContentType === 14 || aContentType === 15) && (aContext instanceof Ci.nsIDOMNode)) {
              if (locationURL != "data:application/x-noscript-blocked,") {
                mustCountObject = false; // we do it in _preProcessObjectElements()
                this.delayExec(this.tagForReplacement, 0, aContext, {
                  url: locationURL,
                  site: locationSite,
                  mime: mimeKey,
                  originSite: originSite
                });
              }
            } else if (this.consoleDump & LOG_CONTENT_BLOCK) this.dump("Context is not a DOMNode? " + aContentType);
          } catch(ex) {
            if(this.consoleDump) this.dump(ex);
          } finally {
            return this.reject("Forbidden " + (contentDocument ? ("IFrame " + contentDocument.URL) : "Content"), arguments);
          }
        }
      } else {


        if (isSilverlight) {
          this.setExpando(aContext, "silverlight", aContentType != 12);
        }
        if (this.consoleDump & LOG_CONTENT_CALL) {
          this.dump(locationURL + " Allowed, " + new Error().stack);
        }
      }
    } catch(e) {
      return this.reject("Content (Fatal Error, " + e  + " - " + e.stack + ")", arguments);
    } finally {

      if (aContentType === 5) this.setExpando(aContext, "site", locationSite);

      if (mustCountObject) this.countObject(aContext, locationSite);

      if (!aInternalCall) PolicyState.removeCheck(aContentLocation);

      if (isHTTP) PolicyState.save(aContentLocation, arguments);

    }
    return CP_OK;
  },


  shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
    return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, CP_SHOULDPROCESS);
  },


}

var PolicyUtil = {
  supportsXSL: ("TYPE_XSLT" in Ci.nsIContentPolicy),
  isXSL: function(ctx) {
    return ctx && !(ctx instanceof Ci.nsIDOMHTMLLinkElement || ctx instanceof Ci.nsIDOMHTMLStyleElement || ctx instanceof Ci.nsIDOMHTMLDocument);
  },

};
