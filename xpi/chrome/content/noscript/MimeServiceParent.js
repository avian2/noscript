var MimeService = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIMessageListener, Ci.nsISupportsWeakReference]),
  service: Cc['@mozilla.org/uriloader/external-helper-app-service;1']
            .getService(Ci.nsIMIMEService),
  getTypeFromExtension(ext) {
    return this.service.getTypeFromExtension(ext);
  },
  receiveMessage(m) {
    if (m.name === "NoScript:getMime") {
      try {
       return this.getTypeFromExtension(m.data.ext);
      } catch (e) {
        ns.dump(`Could not guess mime type for ${m.data.ext}`);
      }
    }
    return '';
  }
};
Services.ppmm.addWeakMessageListener("NoScript:getMime", MimeService);
