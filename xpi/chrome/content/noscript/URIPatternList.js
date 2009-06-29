function URIPatternList(s) {
  this.source = s;
  this.rx = this.parse(s);
}
URIPatternList.create = function(s) {
  return s && new URIPatternList(s);
}

URIPatternList.prototype = {
  test: function(u) {
    return this.rx && this.rx.test(u);  
  },
  testURI: function(uri) {
    return this.test(uri.spec);  
  },
  
  parse: function(s) {
    try {
      var rxSource = s && s.split(/\s+/).map(function(p) {
        
        if (p == '*') return '.*';
        
        if (!/\S+/.test(p)) return null;
        
        if(!/[^\w\-/:%@;&#\?\.\*]/.test(p)) {
         
          // either simple or glob
          const hasPath = /^(?:\w+:\/\/|)[^\/]+\//.test(p);
          const hasScheme = /^[a-z]\w+:(?:\/+|[^/]*\D)/.test(p);

          p = p.replace(/[\.\?\-]/g, "\\$&"); // escape special regexp chars

          if (!hasScheme) { // adjust for no protocol
            p = "[a-z]+\\w+://" + p;
          }

          if (!hasPath) { // adjust for no path
            p += "(?:[/\\?#]|$)";
          }
          
          if (!/\*/.test(p)) {
            // simple "starts with..." site matching
            return '^' + p;
          }
          
          // glob matching
          if (hasPath) p += '$'; 

          return '^' + p.replace(/\*/g, '.*?').replace(/^([^\/:]+:\/*)\.\*/, "$1[^/]*");
        } 
        // raw regexp!
        try {
         new RegExp(p); // check syntax
        } catch(e) {
          dump("Illegal regexp in URIPatternList: " + p + " -- " + e + "\n");
          return null;
        }
        return p;
      }).filter(function(p) { return p; }).join("|");
        
      return rxSource ? new RegExp(rxSource) : null;
    } catch(e) {
      dump("Illegal URIPatternList: " + s + " -- " + e + "\n");
      return null;
    }
  }
};
