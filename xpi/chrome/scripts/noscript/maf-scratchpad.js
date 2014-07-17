/*
 * This is a JavaScript Scratchpad.
 *
 * Enter some JavaScript, then Right Click or choose from the Execute Menu:
 * 1. Run to evaluate the selected text (Ctrl+R),
 * 2. Inspect to bring up an Object Inspector on the result (Ctrl+I), or,
 * 3. Display to insert the result in a comment after the selection. (Ctrl+L)
 */

let eh = gBrowser.selectedBrowser.docShell.chromeEventHandler;

if (window.maf) eh.removeEventListener("MozAfterPaint", window.maf, true);

eh.addEventListener("MozAfterPaint", window.maf = 
function(ev) {
  let w = ev.target;
 
  let url = w.location.href;
  let ox = w.mozInnerScreenX + w.scrollX, oy = w.mozInnerScreenY + w.scrollY;
  
  let rr = ev.clientRects;

  for (let j = rr.length; j-- > 0;) {
    let r = rr[j];
    let box = { 
      url: url, 
      ts: ev.timeStamp,
      top: r.top + oy, left: r.left + ox, right: r.right + ox, bottom: r.bottom + oy,
      width: r.width, height: r.height,
    };
    
    let msg = box.toSource();
    Cu.reportError(msg);
 
  }
  
}, true);

/*
undefined
*/