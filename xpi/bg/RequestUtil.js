'use strict';
var RequestUtil = {

  async executeOnStart(request, details) {
    let {requestId, tabId, frameId} = request;
    details = Object.assign({
      runAt: "document_start",
      frameId,
    }, details);
    let filter = browser.webRequest.filterResponseData(requestId);
    filter.ondata = event => {
      filter.write(event.data);
      filter.disconnect();
      browser.tabs.executeScript(tabId, details);
    }
  },
  async prependToScripts(request, preamble) {
    let filter = browser.webRequest.filterResponseData(request.requestId);
    let decoder = new TextDecoder("utf-8");
    let encoder = new TextEncoder();
    let buffer = "";

    let write = data => filter.write(encoder.encode(data));
    let done = () => {
      write(buffer);
      filter.disconnect();
    };

    filter.ondata = event => {
      buffer += decoder.decode(event.data, {stream: true});
      if (/<\w+\S+\w+=/.test(buffer)) { // matches any tag with attributes
        buffer = preamble + buffer;
        done();
        return;
      }

      let startPos = buffer.lastIndexOf("<");
      let endPos = buffer.lastIndexOf(">");
      if (startPos === -1 || endPos > startPos) {
        write(buffer);
        buffer = "";
        return;
      }

      if (startPos > 0) {
        write(buffer.substring(0, startPos));
        buffer = buffer.substring(startPos);
      }
    }

    filter.onstop = event => {
      done();
    }
  }
}
