var Entities = {

  get htmlNode() {
    delete this.htmlNode;
    var impl = Cc["@mozilla.org/xul/xul-document;1"].createInstance(Ci.nsIDOMDocument).implementation;
    return this.htmlNode = (("createHTMLDocument" in impl)
      ? impl.createHTMLDocument("")
      : impl.createDocument(
        HTML_NS, "html", impl.createDocumentType(
          "html", "-//W3C//DTD HTML 4.01 Transitional//EN", "http://www.w3.org/TR/html4/loose.dtd"
        ))
      ).createElementNS(HTML_NS, "body");
  },
  convert: function(e) {
    try {
      this.htmlNode.innerHTML = e;
      var child = this.htmlNode.firstChild || null;
      return child && child.nodeValue || e;
    } catch(ex) {
      return e;
    }
  },
  convertAll: function(s) {
    return s.replace(/[\\&][^<>]+/g, function(e) { return Entities.convert(e) });
  },
  convertDeep: function(s) {
    for (var prev = null; (s = this.convertAll(s)) !== prev || (s = unescape(s)) !== prev; prev = s);
    return s;
  },
  neutralize: function(e, whitelist) {
    var c = this.convert(e);
    return (c == e) ? c : (whitelist && whitelist.test(c) ? e : e.replace(";", ","));
  },
  neutralizeAll: function(s, whitelist) {
    return s.replace(/&[\w#-]*?;/g, function(e) { return Entities.neutralize(e, whitelist || null); });
  }
};
