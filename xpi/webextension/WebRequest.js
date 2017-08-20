{
  let CSP = {
    name: "Content-Security-Policy",
    value: "x-NoScript-start; script-src 'none'; x-NoScript-stop;",
  };

  var WebRequest = {
    start() {
      let wr = browser.webRequest;
      let listeners = this.listeners;
      wr.onBeforeRequest.addListener(listeners.onBeforeRequest,
        {urls: ["<all_urls>"]},
        ["blocking"]
      );
      wr.onHeadersReceived.addListener(listeners.onHeadersReceived,
        {urls: ["<all_urls>"]},
        ["blocking", "responseHeaders"]
      );

    },

    stop() {
      let wr = browser.webRequest;
      for (let [name, listener] of Object.entries(this.listeners)) {
        wr[name].removeListener(listener);
      }
    },
    listeners: {
      async onBeforeRequest(e) {
        // suspend every request until we've got a policy
        let policy = await ns.retrievePolicy();
        return policy.isAllowed(e.url, e.type);
      },
      onHeadersReceived(e) {
        let header;
        let responseHeaders = e.responseHeaders;
        for (let h of responseHeaders) {
          if (h.name === CSP.name) {
            while(h.value.includes(CSP.value)) {
              h.value = h.value.replace(CSP.value, '');
              if (/^\s*$/.test(h.value)) {
                header = h;
                h.value = "";
              }
            }
          }
        }
        if (!ns.isJSEnabled(e.url)) {
          if (header) {
            header.value = CSP.value;
          } else {
            responseHeaders.push(header = CSP);
          }
        }
        return header ? {responseHeaders} : null;
      },
    }
  };
}
