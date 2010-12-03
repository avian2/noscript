var Plugins = {
  QueryInterface: xpcom_generateQI([CI.nsISupports, CI.nsIFactory]),
  _disabled: false,
  get disabled() this._disabled,

  _registrar: Components.manager.nsIComponentRegistrar,
  _CTRID: "@mozilla.org/plugin/host;1",
  get _CID() {
    delete this._CID;
    return this._CID = this._registrar.contractIDToCID(this._CTRID);
  },
  get _factory() {
    delete this._factory;
    return this._factory = Components.manager.getClassObject(CC[this._CTRID], CI.nsIFactory);
  },

  set disabled(b) {
    if (b == this._disabled) return b;
    if (b) {
      this._registrar.unregisterFactory(this._CID, this._factory);
    } else {
       this._registrar.registerFactory(this._CID, "PluginHost", this._CTRID, this._factory);
    }
    return this._disabled = !!b;
  }
};
