'use strict';

var XSS = (() => {

  const SANITIZE_WINDOW_NAME =
  `<script>
    window.name = window.name.replace(/[<"'\`(=]/g, '');
    document.currentScript.parentNode.removeChild(document.currentScript);
   </script>`
  const ABORT = {cancel: true}, ALLOW = {};

  async function requestListener(request) {
    let xssReq = XSS.parseRequest(request);
    if (!xssReq) return null;
    let reasons = await XSS.maybe(xssReq);
    if (!reasons) return ALLOW;

    let {srcOrigin, destOrigin, unescapedDest} = xssReq;
    let block = !!(reasons.urlInjection || reasons.postInjection)
    let data = [];
    if (reasons.protectName) data.push("window.name");
    if (reasons.urlInjection) data.push(`(URL) ${unescapedDest}`);
    if (reasons.postInjection) data.push(`(POST) ${reasons.postInjection}`);

    let source = srcOrigin && srcOrigin !== "null" ? srcOrigin : "[...]";

    let {button, option} = await Prompts.prompt({
      title: _("XSS.promptTitle"),
      message: _("XSS.promptMessage", [source, destOrigin, data.join(",")]),
      options: [
        {label: _(`XSS.opt${block ? 'Block' : 'Sanitize'}`), checked: true}, // 0
        {label: _("XSS.optAllow")}, // 1
        {label: _("XSS.optAlwaysAllow", [source, destOrigin])}, // 2
      ],

      buttons: [_("Ok")],
      multiple: "focus",
      width: 600,
      height: 480,
    });

    if (button === 0 && option > 0) {
      if (option === 2) { // remeber origin and destination
        let whitelist = await XSS.Exceptions.getWhitelist();
        let allowedSources = new Set(whitelist[destOrigin] || []);
        allowedSources.add(srcOrigin);
        whitelist[destOrigin] = [...allowedSources];
        await XSS.Exceptions.setWhitelist(whitelist);
      }
      return ALLOW;
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
        error(e, "Cannot create URL object for %s", url);
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
        unescapedDest,
        isGet,
        isPost: !isGet && method === "POST",
      }
    },

    async maybe(request) { // return reason or null if everything seems fine
      let xssReq = request.xssUnparsed ? request : this.parseRequest(request);
      request = xssReq.xssUnparsed;
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

      let postInjection = xssReq.isPost && ic.checkPost(request.requestBody.formData, skipParams);
      let protectName = ic.nameAssignment;
      let urlInjection = ic.checkUrl(destUrl, skipRx);
      protectName = protectName || ic.nameAssignment;
      ic.reset();
      return !(protectName || postInjection || urlInjection) ? null
        : { protectName, postInjection, urlInjection };
    }
  };
})();
