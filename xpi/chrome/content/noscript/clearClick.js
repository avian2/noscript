var ClearClick = {
  params: null,
  init: function() {
    this.dialog = document.documentElement;
    if (!(window.arguments && window.arguments.length)) this.dialog.cancelDialog();
    this.params = window.arguments[0];
    this.params.locked = true;
    var url = this.url = this.params.url;
    
    var img = this.params.img;
    
    var preview = document.getElementById("trueImg");
    preview.src = img.src;
    preview.width = img.width;
    preview.height = img.height;
    
    preview = document.getElementById("fakeImg");
    preview.src = img.altSrc;
    preview.width = img.width;
    preview.height = img.height;
    
    if (url.length > 50) url = url.substring(0, 23) + "..." + url.slice(-23);
    document.getElementById("hiddenContentURL").value = url;
  },
  
  browse: function() {
    noscriptUtil.browse(this.url, null);
    this.dialog.cancelDialog();
  },
  
  disclosure: function() {
    noscriptUtil.browse("http://noscript.net/faq#clearclick", null);
    this.dialog.cancelDialog();
  },
  
  end: function() {
    this.params.locked = document.getElementById("keepLocked").checked;
  },
  
  swap: function(stack) {
    stack.appendChild(stack.firstChild);
  }
}