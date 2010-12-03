var Plugins = {
  QueryInterface: xpcom_generateQI([CI.nsISupports, CI.nsIFactory]),
  _disabled: false,
  get disabled() this._disabled,
  set disabled(b) {
    if (b == this._disabled) return b;
    
    if (!this.pluginHost) { // init
      const registrar = Components.manager.nsIComponentRegistrar;
      const CTRID = "@mozilla.org/plugin/host;1";
      this.pluginHost = CC[CTRID].getService(CI.nsIPluginHost);
      const CID = registrar.contractIDToCID("@mozilla.org/plugin/host;1");
      registrar.unregisterFactory(CID,
        Components.manager.getClassObject(CC[CTRID], CI.nsIFactory)
      );
      registrar.registerFactory(CID,
        "NoScript PluginHost Wrapper",
        CTRID,
        this.QueryInterface(CI.nsIFactory)
      );
    }
    return this._disabled = !!b;
  },

  _disabledError:  Components.results.NS_ERROR_NO_AGGREGATION, // this won't pollute console
  createInstance: function(outer, iid) {
    if (this._disabled || outer) {
      throw this._disabledError;
    }
    
    const ph = this.pluginHost;
    return iid ? ph.QueryInterface(iid) : ph;
  }
}
