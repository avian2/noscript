var $ = function(id) { return document.getElementById(id); }
var $$ = function(tag) { return document.getElementsByTagName(tag); }

function UIUtils(serv) {
  this.serv = serv;
}
UIUtils.prototype = {
  tabselPrefName: "options.tabSelectedIndexes",
  resumeTabSelections: function() {
    var info = window.arguments && window.arguments[0];
    var indexes = info && info.tabselIndexes ||
      this.serv.getPref(this.tabselPrefName, "").split(/\s*,\s*/);
    // select tabs from external param
    
    var tabs = $$("tabs");
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
    
    if (info && info.callback) {
      window.setTimeout(info.callback, 0);
    }
  },
  
  persistTabSelections: function() {
    var tabs = $$("tabbox");
    var ss = [];
    for(var tcount = 0; tcount < tabs.length; tcount++) {
      ss.push(tabs[tcount].selectedIndex);
    }
    this.serv.setPref(this.tabselPrefName, ss.join(","));
  },
  
  visitCheckboxes: function(callback) {
    const rxOpt=/^(inv|moz|)opt-(.*)/;
    var j, checkbox, match;
    const opts = $$("checkbox");
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
    const opts = $$("textbox");
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
  },
  
  moveButtonsDown: function() {
    var ref = document.documentElement.getButton("extra2");
    Array.slice(arguments, 0).forEach(function(s) {
      var b;
      if (s) {
        b = $(s);
        b.className = ref.className;
      } else {
        b = document.createElement("spacer");
        b.setAttribute("flex", "1");
      }
      ref.parentNode.insertBefore(b, ref);
      b.hidden = false;
    });
  }
};


function ConditionalGroup(serv, prefName, def) {
  this.serv = serv;
  this.prefName = prefName;
  this.cbx = $("cbx-" + prefName);
  this.sel = $("sel-" + prefName);
  var value = this.serv.getPref(prefName) || 0;
  this.defaultIndex = typeof(def) == "number" ? def - 1 : 0;
  this.cbx.checked =  !!value;
  this.sel.selectedIndex = value ? value - 1: this.defaultIndex;
  var self = this;
  this.cbx.addEventListener("command", function(ev) { self.changed() }, false);
  this.changed();
}

ConditionalGroup.changed = function(cbx) {
  cbx.conditionalGroup.changed();
}

ConditionalGroup.prototype = {
  changed: function() {
    this.sel.disabled = !this.cbx.checked;
    if(this.cbx.checked && this.sel.selectedIndex < 0)
      this.sel.selectedIndex = this.defaultIndex;
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
      
      fp.init(window, this.title, ci.nsIFilePicker.modeOpen);
      fp.appendFilter(this.serv.getString("audio.samples"),"*.wav");
      fp.filterIndex=0;
      const ret = fp.show();
      if (ret == ci.nsIFilePicker.returnOK || ret==ci.nsIFilePicker.returnReplace) {
        this.setSample(fp.fileURL.spec);
        this.play();
      }
    } catch(ex) {
      noscriptUtil.prompter.alert(window, this.title, ex.toString());
    }
  },
  setSample: function(url) {
    $(this.id).value = url || this.def;
  },
  getSample: function() {
    return $(this.id).value;
  },
  play: function() {
    this.serv.playSound(this.getSample(), true);
  }
};

function RegExpController(prefix, parseMethod, value) {
  this.parse = parseMethod || this.parse;
  this.regexp = $(prefix + "-regexp");
  this.sample = $(prefix + "-sample");
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
