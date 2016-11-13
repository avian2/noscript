var MimeService = {
  _cache: new Map(),
  getTypeFromExtension(ext) {
    if (ext) {
      let cache = this._cache;
      if (cache.has(ext)) {
        return cache.get(ext);
      }
      let res = Service.cpmm.sendSyncMessage("NoScript:getMime");
      cache.set(ext, res);
      return res;
    }
  }
};
