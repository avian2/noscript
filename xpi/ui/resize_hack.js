document.addEventListener("DOMContentLoaded", e => {
  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See https://bugzilla.mozilla.org/show_bug.cgi?id=1402110
  browser.windows.getCurrent(win => {
    if (win.url === document.URL) {
      browser.windows.update(win.id, {
        width: win.width + 1
      });
    }
  });
});
