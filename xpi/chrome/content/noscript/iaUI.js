function UIUtils(serv) {
  this.serv = serv;
}
UIUtils.prototype = {
  tabselPrefName: "options.tabSelectedIndexes",
  resumeTabSelections: function() {
    var indexes = window.arguments && window.arguments[0] && window.arguments[0].tabselIndexes ||
      this.serv.getPref(this.tabselPrefName, "").split(/\s*,\s*/);
    // select tabs from external param

    var tabs = document.getElementsByTagName("tabs");
    var tcount = Math.min(tabs.length, indexes.length);
    var listener = function(ev) { arguments.callee.binding.persistTabSelections(); }
    listener.binding = this;
    for(var t = tabs.length; t-- > 0;) {
      try {
        tabs[t].selectedIndex = parseInt(indexes[t]) || 0;
      } catch(e) {}
      tabs[t].addEventListener("select", listener, false); 
    }
    this.persistTabSelections();
  },
  
  persistTabSelections: function() {
     var tabs = document.getElementsByTagName("tabbox");
     var ss = [];
     for(var tcount = 0; tcount < tabs.length; tcount++) {
       ss.push(tabs[tcount].selectedIndex);
     }
     this.serv.setPref(this.tabselPrefName, ss.join(","));
  },
  
  visitCheckboxes: function(callback) {
    const rxOpt=/^(inv|moz|)opt-(.*)/;
    var j, checkbox, match;
    const opts = document.getElementsByTagName("checkbox");
    for(j = opts.length; j-- > 0;) {
      checkbox = opts[j];
      if((match = checkbox.id.match(rxOpt))) {
        callback(match[2], match[1] == "inv", checkbox, match[1] == "moz");
      }
    }
  },
  
  visitTextboxes: function(callback) {
    const rxOpt=/^opt-(.*)/;
    var j, box, match;
    const opts = document.getElementsByTagName("textbox");
    for(j = opts.length; j-- > 0;) {
      box = opts[j];
      if((match = box.id.match(rxOpt))) {
        callback(match[1], box);
      }
    }
  },
  
  syncGroup: function(caption) {
    var b = !caption.checked;
    var node = caption.parentNode;
    while((node = node.nextSibling)) {
      node.disabled = b;
    }
  }
  
};


function ConditionalGroup(serv, prefName, def) {
  this.serv = serv;
  this.prefName = prefName;
  this.cbx = document.getElementById("cbx-" + prefName);
  this.sel = document.getElementById("sel-" + prefName);
  var value = this.serv.getPref(prefName, def);
  this.defaultIndex = typeof(def) == "number" ? def : 0;
  this.cbx.checked =  !!value;
  this.sel.selectedIndex = value ? value - 1 : def;
  var instance = this;
  this.cbx.conditionalGroup = this;
  this.cbx.setAttribute("oncommand", "this.conditionalGroup.changed()");
  this.changed();
}

ConditionalGroup.prototype = {
  changed: function() {
    this.sel.disabled = !this.cbx.checked;
    if(this.cbx.checked && this.sel.selectedIndex < 0) {
      this.sel.selectedIndex = this.defaultIndex;
    }
  },
  getValue: function() {
    return this.cbx.checked && this.sel.selectedIndex + 1 || 0;
  },
  persist: function() {
    this.serv.setPref(this.prefName, this.getValue());
  }
};

function SoundChooser(id, title, serv, def) {
  this.id = id;
  this.title = title;
  this.serv = serv;
  this.def = def;
}

SoundChooser.prototype = {
  choose: function(btn) {
    try {
      const cc=Components.classes;
      const ci=Components.interfaces;
      const fp = cc["@mozilla.org/filepicker;1"].createInstance(ci.nsIFilePicker);
      
      fp.init(window,title, ci.nsIFilePicker.modeOpen);
      fp.appendFilter(this.serv.getString("audio.samples"),"*.wav");
      fp.filterIndex=0;
      const ret=fp.show();
      if (ret==ci.nsIFilePicker.returnOK || ret==ci.nsIFilePicker.returnReplace) {
        this.setSample(fp.fileURL.spec);
        this.play();
      }
    } catch(ex) {
      noscriptUtil.prompter.alert(window, title, ex.toString());
    }
  },
  setSample: function(url) {
    document.getElementById(this.id).value = url || this.def;
  },
  getSample: function() {
    return document.getElementById(this.id).value;
  },
  play: function() {
    this.serv.playSound(this.getSample(), true);
  }
};

function RegExpController(prefix, parseMethod, value) {
  this.parse = parseMethod || this.parse;
  this.regexp = document.getElementById(prefix + "-regexp");
  this.sample = document.getElementById(prefix + "-sample");
  var listener = function(ev) { arguments.callee.binding.feedback(); };
  listener.binding = this;
  this.regexp.addEventListener("input", listener, false);
  this.sample.addEventListener("input", listener, false);
  this.regexp.value = value;
  this.feedback();
}

RegExpController.prototype = {
  parse: function(s) { return new RegExp(s, "g"); },
  validate: function() {
    const textbox = this.regexp;
    try {
      const rx = this.parse(textbox.value);
      if(rx) {
        textbox.className = "";
        return rx;
      }
    } catch(e) {}
    textbox.className = "noscript-error";
    return null;
  },
  feedback: function() {
    const rx = this.validate();
    const sample = this.sample; 
    if(rx && rx.test(sample.value)) {
      sample.className = "";
    } else {
      sample.className = "noscript-error";
    }
    return rx;
  },
  getValue: function(valid) {
    if(valid && !this.validate()) return null;
    return this.regexp.value;
  }
};
