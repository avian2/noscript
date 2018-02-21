// Tree clipboard utils

const Cc = Components.classes, Ci = Components.interfaces, Cu = Components.utils;

var noscriptTreeCc = {
  cb: Cc["@mozilla.org/widget/clipboardhelper;1"].getService(Ci.nsIClipboardHelper),

  getSelectionString: function(tree, csc, rsc) {
    if (!rsc) rsc = "\n";
    let start = new Object(), end = new Object(), v = tree.view, out = "";
    let numRanges = v.selection.getRangeCount();
    let b = tree.boxObject;
    b.QueryInterface(Ci.nsITreeBoxObject);
    let cols = b.columns, l = cols.length - 1;

    for (let i = 0; i < numRanges; i++) {
      v.selection.getRangeAt(i,start,end);
      for (let r = start.value; r <= end.value; r++) {
        for (let c = 0; c <= l; c++) {
          let f = c != l ? csc : ""
          out += v.getCellText(r, cols.getColumnAt(c)) + f;
        }
        out += rsc;
      }
    }
    return out.trim();
  },

  getSelectedItems: function(tree, sourceData) {
    let start = new Object(), end = new Object(), v = tree.view, out = [];
    let numRanges = v.selection.getRangeCount();
    let b = tree.boxObject;
    b.QueryInterface(Ci.nsITreeBoxObject);
    let cols = b.columns, l = cols.length - 1;

    for (let i = 0; i < numRanges; i++) {
      v.selection.getRangeAt(i,start,end);
      for (let r = start.value; r <= end.value; r++) {
        out.push(sourceData[r]);
      }
    }
    return out;
  },

  selectAll: function(t) {
    t.view.selection.selectAll();
  },

  doCopy: function(t, csc, rsc) {
    this.cb.copyString(this.getSelectionString(t, csc, rsc));
  }

};
