(async () => {
  if (window.navigator.userAgent.indexOf("Gecko/") === -1) {
    // Don't adjust for Chrome, as it has a different problem entirely
    return;
  }
  let dppx = 1;
  try {
    const res = await browser.tabs.executeScript(undefined, {
      code: "window.devicePixelRatio;"
    });
    dppx = Number(res[0]);
    browser.storage.local.set({
      popupdppx: dppx
    });
  } catch (error) {
    // This happens if we do not have permission to run execute script
    // For example on browser-internal pages such as about:addons or about:newtab
    const res = await browser.storage.local.get("popupdppx");
    if (res.hasOwnProperty("popupdppx")) {
      dppx = res.popupdppx;
    }
  }
  if (dppx !== window.devicePixelRatio) {
    document.body.style.transform = `scale(${dppx / window.devicePixelRatio})`;
    document.body.style.transformOrigin = "top left";
  }
}
)();
