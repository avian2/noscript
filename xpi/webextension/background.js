var policy;
var webRequestInitialized = false;

function initWebRequest() {
  if (webRequestInitialized) return;
  webRequestInitialized = true;
  browser.webRequest.onHeadersReceived.addListener(setCSP,
    {urls: ["<all_urls>"]},
    ["blocking", "responseHeaders"]
  );
  console.log(`NoScript WebExt webRequest initialized`);
}
var legacyPort = browser.runtime.connect({name: "legacy"});
legacyPort.onMessage.addListener(msg => {

  switch(msg.type) {
    case "configure":
      initWebRequest();
      policy = msg.policy;
    break;
    case "saveData":
      console.log(`browser.storage: ${browser.storage}, manifest: ${uneval(browser.runtime.getManifest())}`);
      browser.permissions.getAll().then(p => console.log(`Permissions:  ${uneval(p.permissions)}`));
      browser.storage.local.set(msg.data);
    break;

    case "dumpData":
      browser.storage.local.get(null, items => console.log(items));
    break;
  }
});

const CSP = {
  name: "Content-Security-Policy",
  value: "x-NoScript-start; script-src 'none'; x-NoScript-stop;"
};

function isJSEnabled(urlString) {
  if (!(policy && policy.enforced)) {
    return true;
  }
  let url = new URL(urlString);
  return url.origin in policy.origins && policy.origins[url.origin].js;
}

function setCSP(e) {
  let header;
  for (let h of e.responseHeaders) {
    if (h.name === CSP.name) {
      while(e.value.includes(CSP.value)) {
        h.value = h.value.replace(CSP.value, '');
        if (/^\s*$/.test(h.value)) {
          header = h;
          h.value = "";
        }
      }
    }
  }
  if (!isJSEnabled(e.url)) {
    if (header) {
      header.value = CSP.value;
    } else {
      e.responseHeaders.push(header = CSP);
    }
  }
  return header ? {responseHeaders: e.responseHeaders} : null;
}


browser.runtime.sendMessage("READY");
console.log("NoScript WebExt Ready");

