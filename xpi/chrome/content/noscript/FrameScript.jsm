var EXPORTED_SYMBOLS = ["FrameScript"];

Components.utils.import("chrome://noscript/content/PasteHandler.jsm");

function FrameScript(ctx) {
  this.ctx = ctx;
  new PasteHandler(ctx);
}

FrameScript.prototype = {

}
