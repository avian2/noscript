var IO = {
  readFile: function(file, charset) {
    var res;

    const is = Cc["@mozilla.org/network/file-input-stream;1"]
      .createInstance(Ci.nsIFileInputStream );
    is.init(file ,0x01, 256 /*0400*/, null);
    const sis = Cc["@mozilla.org/scriptableinputstream;1"]
      .createInstance(Ci.nsIScriptableInputStream);
    sis.init(is);

    res = sis.read(sis.available());
    is.close();

    if (charset !== null) { // use "null" if you want uncoverted data...
      const unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
        .createInstance(Ci.nsIScriptableUnicodeConverter);
      try {
        unicodeConverter.charset = charset || "UTF-8";
      } catch(ex) {
        unicodeConverter.charset = "UTF-8";
      }
      res = unicodeConverter.ConvertToUnicode(res);
    }

    return res;
  },
  writeFile: function(file, content, charset) {
    const unicodeConverter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
      .createInstance(Ci.nsIScriptableUnicodeConverter);
    try {
      unicodeConverter.charset = charset || "UTF-8";
    } catch(ex) {
      unicodeConverter.charset = "UTF-8";
    }

    content = unicodeConverter.ConvertFromUnicode(content);
    const os = Cc["@mozilla.org/network/file-output-stream;1"]
      .createInstance(Ci.nsIFileOutputStream);
    os.init(file, 0x02 | 0x08 | 0x20, 448 /*0700*/, 0);
    os.write(content, content.length);
    os.close();
  },

  safeWriteFile: function(file, content, charset) {
    var tmp = file.clone();
    var name = file.leafName;
    tmp.leafName = name + ".tmp";
    tmp.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, file.exists() ? file.permissions : 384 /*0600*/);
    this.writeFile(tmp, content, charset);
    tmp.moveTo(file.parent, name);
  }
};
