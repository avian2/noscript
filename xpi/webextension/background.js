var policy;

var legacyPort = browser.runtime.connect({name: "legacy"});
legacyPort.onMessage.addListener(msg => {
  console.log(`NoScript WebExt received message ${msg.toSource()}`);
  switch(msg.type) {
    case "configure":
      policy = msg.policy;
    break;
  }
});

const CSP = {
  name: "Content-Security-Policy",
  value: "x-NoScript-start; script-src 'none'; x-NoScript-stop;"
};

function isJSEnabled(urlString) {
  if (policy && policy.enforced) {
    return true;
  }
  let url = new URL(urlString);
  return url.origin in policy.origins && policy.origins[url.origin].js;
}

function setCSP(e) {
  let header;
  for (let h of e.requestHeaders) {
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
      e.requestHeaders.push(header = CSP);
    }
  }
  return header ? {requestHeaders: e.requestHeaders} : null;
}


browser.webRequest.onHeadersReceived.addListener(setCSP,
  {urls: ["<all_urls>"]},
  ["blocking", "requestHeaders"]
);


setTimeout(() => {
  browser.runtime.sendMessage("READY");
  console.log("NoScript WebExt Ready");
}, 10000);

