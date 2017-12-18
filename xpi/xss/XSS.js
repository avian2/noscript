'use strict';

var XSS = (() => {

  const SANITIZE_WINDOW_NAME =
  `<script>
    window.name = window.name.replace(/[<"'\`(=]/g, '');
    document.currentScript.parentNode.removeChild(document.currentScript);
   </script>`
  const ABORT = {cancel: true}, ALLOW = {};

  async function requestListener(request) {
    let policy = ns.policy;
    if (policy.enforced) {
      let {type} = request;
      if (type !== "main_frame") {
        if (type === "sub_frame") type = "frame";
        if (!policy.can(request.url, type, request.originUrl)) {
          return ALLOW; // it will be blocked by RequestGuard
        }
      }
    }
    let xssReq = XSS.parseRequest(request);
    if (!xssReq) return null;
    let data;
    let reasons;
    try {
      reasons = await XSS.maybe(xssReq);
      if (!reasons) return ALLOW;
      if (reasons.user) {
        log("Blocking request from %s to %s by previous XSS prompt user choice",
          xssReq.srcUrl, xssReq.destUrl);
        return ABORT;
      }
      data = [];
    } catch (e) {
      error(e, "XSS filter processing %o", xssReq);
      reasons = { urlInjection: true };
      data = [e.toString()];
    }

    let {srcOrigin, destOrigin, unescapedDest} = xssReq;
    let block = !!(reasons.urlInjection || reasons.postInjection)

    if (reasons.protectName) data.push("window.name");
    if (reasons.urlInjection) data.push(`(URL) ${unescapedDest}`);
    if (reasons.postInjection) data.push(`(POST) ${reasons.postInjection}`);

    let source = srcOrigin && srcOrigin !== "null" ? srcOrigin : "[...]";

    let {button, option} = await Prompts.prompt({
      title: _("XSS.promptTitle"),
      message: _("XSS.promptMessage", [source, destOrigin, data.join(",")]),
      options: [
        {label: _(`XSS.opt${block ? 'Block' : 'Sanitize'}`), checked: true}, // 0
        {label: _("XSS.optAlwaysBlock", [source, destOrigin])}, // 1
        {label: _("XSS.optAllow")}, // 2
        {label: _("XSS.optAlwaysAllow", [source, destOrigin])}, // 3
      ],

      buttons: [_("Ok")],
      multiple: "focus",
      width: 600,
      height: 480,
    });

    if (button === 0 && option >= 2) {
      if (option === 3) { // always allow
        await XSS.setUserChoice(xssReq.originKey, "allow");
        await XSS.saveUserChoices();
      }
      return ALLOW;
    }
    if (option === 1) { // always block
      block = true;
      await XSS.setUserChoice(xssReq.originKey, "block");
      await XSS.saveUserChoices();
    }
    if (block) {
      return ABORT;
    }
    if (reasons.protectName) {
      RequestUtil.prependToScripts(request, NUKE_WINDOW_NAME);
    }
    return ALLOW;
  };

  return {
    async start() {
      let {onBeforeRequest} = browser.webRequest;
      if (onBeforeRequest.hasListener(requestListener)) return;

      await include("/legacy/Legacy.js");
      await include("/xss/Exceptions.js");

      this._userChoices = (await SafeSync.get("xssUserChoices")).xssUserChoices || {};

      // conver old style whitelist if stored
      let oldWhitelist = await XSS.Exceptions.getWhitelist();
      if (oldWhitelist) {
        for (let [destOrigin, sources] of Object.entries(oldWhitelist)) {
          for (let srcOrigin of sources) {
            this._userChoices[`${srcOrigin}>${destOrigin}`] = "allow";
          }
        }
        XSS.Exceptions.setWhitelist(null);
      }

      onBeforeRequest.addListener(requestListener, {
        urls: ["*://*/*"],
        types: ["main_frame", "sub_frame", "object"]
      }, ["blocking", "requestBody"]);
    },

    stop() {
      let {onBeforeRequest} = browser.webRequest;
      if (onBeforeRequest.hasListener(requestListener)) {
        onBeforeRequest.removeListener(requestListener);
      }
    },


    parseRequest(request) {
      let {
        url: destUrl,
        originUrl: srcUrl,
        method
      } = request;
      let destObj;
      try {
        destObj = new URL(destUrl);
      } catch (e) {
        error(e, "Cannot create URL object for %s", destUrl);
        return null;
      }
      let srcObj = null;
      if (srcUrl) {
        try {
          srcObj = new URL(srcUrl);
        } catch (e) {}
      } else {
        srcUrl = "";
      }

      let unescapedDest = unescape(destUrl);
      let srcOrigin = srcObj ? srcObj.origin : "";
      let destOrigin = destObj.origin;

      let isGet = method === "GET";
      return {
        xssUnparsed: request,
        srcUrl,
        destUrl,
        srcObj,
        destObj,
        srcOrigin,
        destOrigin,
        get srcDomain() {
          delete this.srcDomain;
          return this.srcDomain = srcObj && srcObj.hostname && tld.getDomain(srcObj.hostname) || "";
        },
        get destDomain() {
          delete this.destDomain;
          return this.destDomain = tld.getDomain(destObj.hostname);
        },
        get originKey() {
          delete this.originKey;
          return this.originKey = `${srcOrigin}>${destOrigin}`;
        },
        unescapedDest,
        isGet,
        isPost: !isGet && method === "POST",
      }
    },

    async saveUserChoices(xssUserChoices = this._userChoices || {}) {
      this._userChoices = xssUserChoices;
      SafeSync.set({xssUserChoices});
    },
    getUserChoices() {
      return this._userChoices;
    },
    setUserChoice(originKey, choice) {
      this._userChoices[originKey] = choice;
    },
    getUserChoice(originKey) {
      return this._userChoices[originKey];
    },

    async maybe(request) { // return reason or null if everything seems fine
      let xssReq = request.xssUnparsed ? request : this.parseRequest(request);
      request = xssReq.xssUnparsed;
      switch (await this.getUserChoice(xssReq.originKey)) {
        case "allow":
          return null;
        case "block":
          return  {user: true};
      }

      if (await this.Exceptions.shouldIgnore(xssReq)) {
        return null;
      }

      let {
        skipParams,
        skipRx
      } = this.Exceptions.partial(xssReq);

      let {destUrl} = xssReq;

      await include("/xss/InjectionChecker.js");
      let ic = await this.InjectionChecker;
      ic.reset();

      let postInjection = xssReq.isPost &&
        request.requestBody && request.requestBody.formData &&
        ic.checkPost(request.requestBody.formData, skipParams);

      let protectName = ic.nameAssignment;
      let urlInjection = ic.checkUrl(destUrl, skipRx);
      protectName = protectName || ic.nameAssignment;
      ic.reset();
      return !(protectName || postInjection || urlInjection) ? null
        : { protectName, postInjection, urlInjection };
    }
  };
})();
