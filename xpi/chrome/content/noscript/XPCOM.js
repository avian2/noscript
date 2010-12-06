const SERVICE_CID = Components.ID(SERVICE_ID);

const SERVICE_FACTORY = {
  get _instance() {
    delete this._instance;
    var i = new SERVICE_CONSTRUCTOR();
    return this._instance = i;
  },
  
  createInstance: function (outer, iid) {
    if (outer != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    xpcom_checkInterfaces(iid, SERVICE_IIDS, Components.results.NS_ERROR_INVALID_ARG);
    return this._instance;
  }
};

function xpcom_generateQI(iids) {
  iids.push(CI.nsISupports);
  return function QueryInterface(iid) {
    for (let i = 0, len = iids.length; i < len; i++)
      if (iids[i].equals(iid)) return this;
    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
}

function xpcom_checkInterfaces(iid, iids, ex) {
  if (iid.equals(CI.nsISupports)) return;
  
  for (let i = iids.length; i-- > 0;)
      if (iid.equals(iids[i])) return;
  
  throw ex;
}

var FILE = null;

var Module = {
  get categoryManager() {
    delete this.categoryManager;
    return this.categoryManager = CC['@mozilla.org/categorymanager;1'
        ].getService(CI.nsICategoryManager);
  },
  firstTime: true,
  registerSelf: function(compMgr, fileSpec, location, type) {
    if (this.firstTime) {

      FILE = fileSpec;
      compMgr.QueryInterface(CI.nsIComponentRegistrar
        ).registerFactoryLocation(SERVICE_CID,
        SERVICE_NAME,
        SERVICE_CTRID, 
        fileSpec,
        location, 
        type);
      const catman = this.categoryManager;
      for (var j = 0, len = SERVICE_CATS.length; j < len; j++) {
        catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
        catman.addCategoryEntry(SERVICE_CATS[j],
          SERVICE_CTRID, SERVICE_CTRID, true, true);
      }
      this.firstTime = false;
      try {
        if (fileSpec instanceof CI.nsILocalFile) {
          fileSpec = fileSpec.parent;
          fileSpec.append(".autoreg");
          fileSpec.remove(false);
        }
      } catch(e) {}
    }
  },
  
  unregisterSelf: function(compMgr, fileSpec, location) {
    compMgr.QueryInterface(CI.nsIComponentRegistrar
      ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
    const catman = this.categoryManager;
    for (var j = 0, len = SERVICE_CATS.length; j < len; j++) {
      catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
    }
  },

  getClassObject: function (compMgr, cid, iid) {
    if (cid.equals(SERVICE_CID))
      return SERVICE_FACTORY;
  
    if (!iid.equals(CI.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
    
    throw Components.results.NS_ERROR_NO_INTERFACE;
  },

  canUnload: function(compMgr) {
    return true;
  }
}
function NSGetModule(compMgr, fileSpec) {
  return Module;
}
function NSGetFactory(cid) {
  if (!SERVICE_CID.equals(cid)) throw Components.results.NS_ERROR_FACTORY_NOT_REGISTERED;
  return SERVICE_FACTORY;
}