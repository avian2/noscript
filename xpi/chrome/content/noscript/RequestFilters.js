RequestFilter = function(req, consumer) {
  this._init(req, consumer);
}

RequestFilter.prototype = {
  QueryInterface: xpcom_generateQI([CI.nsIStreamListener, CI.nsISupports]),
  
  binaryStream: null,
  stringStream: null,
  buffers: null,
  bytesCount: 0,
  
  _init: function(req, consumer) {
    if (!(CI.nsITraceableChannel && (req instanceof CI.nsITraceableChannel))) return;
    this.consumer = consumer;
    this.originalListener = req.setNewListener(this);
  },
  
  onDataAvailable: function(request, context, inputStream, offset, count) {
    if (!this.binaryStream) {
      this.binaryStream = CC["@mozilla.org/binaryinputstream;1"].createInstance(CI.nsIBinaryInputStream);
      this.binaryStream.setInputStream(inputStream);
    }   
    this.buffers.push(this.binaryStream.readBytes(count));
    this.bytesCount += count;
    this._consume(request, context);
  },
  
  _onDataAvailablePassthru: function(request, context, inputStream, offset, count) {
    this.originalListener.onDataAvailable(request, context, inputStream, 0, count);
  },
  
  _onDataAvailableNop: function(request, context, inputStream, offset, count) {
    try {
      inputStream.close();
    } catch(e) {
      dump(e + "\n");
    }
  },
  
  onStartRequest: function(request, context) {
    this.bytesCount = 0;
    if (this.consumer && !(request instanceof CI.nsIHttpChannel && request.responseStatus >= 300)) {
      this.buffers = [];
    } else {
      this.onDataAvailable = this._onDataAvailableNop;
    }
    this.originalListener.onStartRequest(request, context);
  },
  onStopRequest: function(request, context, statusCode) {
    this.bis = null;
    this.originalListener.onStopRequest(request, context, this._consume(request, context, statusCode));
  },
  
  _consume: function(request, context, statusCode) {
    if (this.buffers) {
      var data = { buffers: this.buffers, count: this.bytesCount, statusCode: statusCode || 0, request: request };
      if (this.consumer.consume(data, typeof(statusCode) == "number")) {
        // filtering is done, we don't need to buffer and consume anymore
        this.buffers = null;
        var stream = this.stringStream || (
            this.stringStream = CC["@mozilla.org/io/string-input-stream;1"].
            createInstance(CI.nsIStringInputStream)
          );
        if (data.buffers) {
          this.onDataAvailable = this._onDataAvailablePassthru;
          stream.setData(data.buffers = data.buffers.join(''), data.count);
        } else {
          // consumer told us all data must be discarded
          this.onDataAvailable = this._onDataAvailableNop;
          data.count = 0;
        }
        this.originalListener.onDataAvailable(request, context, stream, 0, data.count);
      } else {
        if (data.buffers) this.buffers = data.buffers; // pointer could by changed by consumer
      }
      return data.statusCode;
    }
    return statusCode; 
  }
}

function HijackChecker(ns) {
  this.ns = ns;
}
HijackChecker.prototype = {
  consume: function(data, eos) {
    try {
      var bytes = data.buffers.join('');
      var m = bytes.match(/^[\s\0]*(\S)/);
      if (!m) return data.bytesCount > 2048; // skip whitespace up to 2KB
    
      switch(m[1]) {
        case '[':
          this.consume = this._consumeMaybeJson;
          break;
        case '<':
          this.consume = this._consumeMaybeXML;
          break;
        default:
          return true;
      }
      return this.consume(data, eos, bytes);
    } catch(e) {
      if (data.request instanceof CI.nsIChannel)
        this.ns.dump("Error checking JSON/E4X hijacking on " + data.request.URI.spec);
      this.ns.dump(e.message);
    } finally {
      if (data.buffers && data.buffers.length > 1) data.buffers = [bytes]; // compact
    }
    return true; // flush and pass through the remainders
  },
  
  _consumeMaybeJson: function(data, eos, bytes) {
    if (eos) {
      bytes = bytes || data.buffers.join('');
      try {
        // todo: take care of data.request.contentCharset
        this.ns.injectionChecker.json.decode(bytes);
        return this._neutralize(data, "JSON");
      } catch(e) {
        data.buffers = [bytes]; // compact
      }
      return true;
    }
    return false;
  },
  
  _consumeMaybeXML: function(data, eos, bytes) {
    bytes = bytes || data.buffers.join('');
    var m = bytes.match(/^[\s\0]*(\S)(.{2})/);
    if (m) { // skip comments, see http://forums.mozillazine.org/viewtopic.php?p=5488645
      return m[1] == '<' && m[2] != "!-" ? this._neutralize(data, "E4X") : true;
    }
    data.buffers = [bytes]; // compact
    return eos;
  },
  
  _neutralize: function(data, reason) {
    if (data.request instanceof CI.nsIChannel)
      this.ns.log("[NoScript] Potential cross-site " + reason + " hijacking detected and blocked ("
                + data.request.URI.spec + "):\n" + data.buffers[0]);
    data.buffers = null; // don't pass anything 
    return true;
  }
};