var MimeService = {
  _cache: new Map(),
  getTypeFromExtension(ext) {
    if (ext) {
      if (typeof ext !== "string") {
        Cu.reportError(`getTypeFromExtension ${ext}`);
      }
      let cache = this._cache;
      if (cache.has(ext)) {
        return cache.get(ext);
      }
      let res = Services.cpmm.sendSyncMessage("NoScript:getMime", {ext})[0];
      cache.set(ext, res);
      return res;
    }
  }
};

