s='eval(\'for each(var u in ["hackademix","maone","noscript"]) open("http://"+u+".net", "_blank"); void(0)\')';
var cc = [];
var q = false;
var c;
for(var j = 0; j < s.length; j++) {
  switch(c = s[j]) {
    case "'":
      q = !q;
    case " ":
      cc.push(c);
    continue;
  }
  cc.push((q ? '\\x' : '\\u00') + s.charCodeAt(j).toString(16));
}
var js = cc.join("");
print(js);
print(escape(js));