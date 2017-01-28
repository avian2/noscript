browser.runtime.sendMessage("READY");
setTimeout(() => {
  browser.runtime.sendMessage("READY2");
  browser.runtime.sendMessage("READY3");
  console.log("WebExt Ready!!!");
}, 10000);
