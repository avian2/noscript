var ClearClick = {
  params: null,
  canClose: true,
  mustClose: false,
  
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
    
    var pref = noscriptUtil.service.getPref("clearClick");
    Array.forEach(document.getElementById("clearClickOpts").getElementsByTagName("checkbox"), function(cbx) {        
      cbx.setAttribute("checked", !(pref & parseInt(cbx.getAttribute("value"))) ? "false" : "true");
    });
    
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
    if (!this.canClose) {
      this.mustClose = true;
      return;
    }
    this.params.locked = document.getElementById("keepLocked").checked;
    var pref = 0;
    Array.forEach(document.getElementById("clearClickOpts").getElementsByTagName("checkbox"), function(cbx) {
      if (cbx.checked) pref = pref | parseInt(cbx.getAttribute("value"));
    });
    noscriptUtil.service.setPref("clearClick", pref);
  },
  
  swap: function(stack) {
    stack.appendChild(stack.firstChild);
  },
  
  report: function() {
    this.dialog.getButton("extra1").disabled = true;
    
    var report = document.getElementById("report");
    var reportId = document.getElementById("report-id");
    var progress = document.getElementById("progress");
    
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      switch(xhr.readyState) {
        case 1:
        case 2:
        case 3:
          ClearClick.canClose = false;
          report.collapsed = false;
          reportId.value = "";
          progress.collapsed = false;
          break;
        case 4:
          ClearClick.canClose = true;
          progress.collapsed = true;
          reportId.value = xhr.responseText.replace(/\s*OK\s*/g, '');
          reportId.collapsed = false;
          reportId.style.visibility = "visible";
          if (ClearClick.mustClose) ClearClick.end();
      }
    };
    
    xhr.open("POST", "http://noscript.net/ws/clearclick/", true);
    
    var p = this.params;
    var data = {
      url: p.url,
      page_url: p.pageURL,
      top_url: p.topURL,
      x: p.pageX,
      y: p.pageY,
      zoom: p.zoom,
      img1: p.img.src,
      img2: p.img.altSrc,
      version: noscriptUtil.service.VERSION
    };
    var post = [];
    for(var k in data) {
      post.push(k + "=" + escape(data[k]));
    }
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    xhr.send(post.join("&"));
  }
  
}