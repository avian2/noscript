/***** BEGIN LICENSE BLOCK *****

NoScript - a Firefox extension for whitelist driven safe JavaScript execution
Copyright (C) 2004-2005 Giorgio Maone - g.maone@informaction.com

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA

***** END LICENSE BLOCK *****/

function UninstallGuard(name) {
  this.name=name;
}

UninstallGuard.prototype={
  uninstalling: false,
  disabled: false,
  get ds() {
    return Components.classes["@mozilla.org/extensions/manager;1"
        ].getService(Components.interfaces.nsIExtensionManager
      ).datasource;
  }
,
  get rdfService() {
    return Components.classes["@mozilla.org/rdf/rdf-service;1"].getService(Components.interfaces.nsIRDFService);
  }
,
  onAssert: function(ds,source,prop,target) {
    this.check(ds,source);
  },
  onBeginUpdateBatch: function(ds) {},
  onChange: function(ds,source,prop,oldTarget,newTarget) {
    this.check(ds,source);
  },
  onEndUpdateBatch: function(ds) {
    this.checkAll(ds);
  },
  onMove: function(ds,oldSource,newSource,prop,target) {
    this.check(ds,newSource);
  },
  onUnassert: function(ds,source,prop,target) {
    this.check(ds,source);
  }
,
  init: function() {
    try {
      this.ds.AddObserver(this);
    } catch(ex) {
      this.log(ex);
    } 
  }
,
  dispose: function() {
    try {
      this.ds.RemoveObserver(this);
    } catch(ex) {
      this.log(ex);
    } 
  }
,
  checkAll: function(ds) {
    const container = Components.classes["@mozilla.org/rdf/container;1"]
               .getService(Components.interfaces.nsIRDFContainer);
    var root = this.rdfService.GetResource("urn:mozilla:extension:root");
    container.Init(ds,root);
    
     var found = false;
     var elements = container.GetElements();
     for(var found=false; elements.hasMoreElements() && !found; ) {
        found=this.check(elements.getNext().QueryInterface(Components.interfaces.nsIRDFResource));
     }
  }
,
  check: function(extensionDS,element) {
    try { 
      const RDFService = this.rdfService;
      var target;
      if((target=extensionDS.GetTarget(element,  
        RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#name") ,true))
        && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value==this.name
        ) {
        this.uninstalling = (
          (target = extensionDS.GetTarget(element, 
            RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeUninstalled"),true)
            ) !=null 
            && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
           );
        this.disabled = (
          (target = extensionDS.GetTarget(element, 
            RDFService.GetResource("http://www.mozilla.org/2004/em-rdf#toBeDisabled"),true)
            ) !=null
            && target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value == "true"
          );
        return true;
      }  
     } catch(ex) {
       this.log(ex);
     } // quick and dirty work-around for Mozilla ;)
     return false;
  }
,
  log: function(msg) {
    dump("UninstallGuard: "+msg+"\n");
  }
};



function NoscriptService() {
  this.register();
}

NoscriptService.prototype={
    get wrappedJSObject() {
    return this;
  }
,
  QueryInterface: function(iid) {
     this.queryInterfaceSupport(iid,SERVICE_IIDS);
     return this;
  }
,
  // nsIObserver implementation 
  observe: function(subject, topic, data) {
    // dump(SERVICE_NAME+" notified of "+subject+","+topic+","+data); //DDEBUG
    
    if(subject instanceof Components.interfaces.nsIPrefBranchInternal) {
      this.syncPrefs(subject,data);
    } else {
      switch(topic) {
        case "xpcom-shutdown":
          this.unregister();
          break;
        case "profile-before-change": 
          this.resetJSCaps();
          break;
        case "profile-after-change":
          this.init();
          break;
        case "em-action-requested":
          if( (subject instanceof Components.interfaces.nsIUpdateItem)
              && subject.id==EXTENSION_ID ) {
              this.uninstallGuard.uninstalling=data=="item-uninstalled";
              this.uninstallGuard.disabled=data=="item-disabled"
          }
      }
    }
  }
,  
  register: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
    Components.interfaces.nsIObserverService);
    osvr.addObserver(this,"profile-before-change",false);
    osvr.addObserver(this,"xpcom-shutdown",false);
    osvr.addObserver(this,"profile-after-change",false);
    osvr.addObserver(this,"em-action-requested",false);
  }
,
  unregister: function() {
    const osvr=Components.classes['@mozilla.org/observer-service;1'].getService(
      Components.interfaces.nsIObserverService);
    osvr.removeObserver(this,"profile-before-change");
    osvr.removeObserver(this,"xpcom-shutdown");
    osvr.removeObserver(this,"profile-after-change");
    osvr.removeObserver(this,"em-action-requested",false);
    if(this.prefs) {
      this.prefs.removeObserver("",this);
      this.mozJSPref.removeObserver("enabled",this,false);
      this.uninstallGuard.dispose();
    }
  }
,
  syncPrefs: function(branch, name) {
    switch(name) {
      case "sites":
        this._sites=null; // invalidate sites list cache
      break;
      case "permanent":
        const permanentList=this.splitList(this.getPref("permanent",
          "googlesyndication.com noscript.net maone.net informaction.com noscript.net"));
        permanentList.concat(["chrome:","resource:"]);
        this.permanentList=this.sortedSiteSet(permanentList);
      break;
      case "temp":
        const tempList=this.splitList(this.getPref("temp"),"");
        tempList.push("jar:");
        this.tempList=this.sortedSiteSet(tempList);
        break;
      case "enabled":
        try {
          this.mozJSEnabled=this.mozJSPref.getBoolPref("enabled");
        } catch(ex) {
          this.mozJSEnabled=true;
        }
      break;
      case "forbidJava":
      case "forbidFlash":
      case "forbidPlugins":
      case "pluginPlaceholder":
        this[name]=this.getPref(name,this[name]);
        this.forbidSomePlugins=this.forbidJava || this.forbidFlash || this.forbidPlugins;
        this.forbidAllPlugins=this.forbidJava && this.forbidFlash && this.forbidPlugins;
      break;
      case "allowClipboard":
        const cp=["cutcopy","paste"];
        const cpEnabled=this.getPref(name,false);
        var cpName;
        for(var cpJ=cp.length; cpJ-->0;) {
          cpName=this.POLICY_NAME+".Clipboard."+cp[cpJ];
          try {
            if(cpEnabled) {
              this.caps.setCharPref(cpName,"allAccess");
            } else {
              this.caps.clearUserPref(cpName);
            }
          } catch(ex) {
            dump(ex+"\n");
          }
        }
      break;
    }
  }
,
  uninstallGuard: new UninstallGuard("NoScript"),
  _uninstalling: false,
  get uninstalling() {
    if(this._uninstalling) return this._uninstalling;
    const ug=this.uninstallGuard;
    return (this._uninstalling=(ug.uninstalling || ug.disabled))?
      this.cleanupIfUninstalling():false;
  }
,
  _inited: false,
  POLICY_NAME: "maonoscript",
  prefService: null,
  caps: null,
  prefs: null,
  mozJSPref: null,
  mozJSEnabled: true
,
  init: function() {
    if(this._inited) return;
    this._inited=true;
    
    const prefserv=this.prefService=Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService)
    const PBI=Components.interfaces.nsIPrefBranchInternal;
    this.caps=prefserv.getBranch("capability.policy.").QueryInterface(PBI);
    this.caps.addObserver("sites",this,false);
    this.prefs=prefserv.getBranch("noscript.").QueryInterface(PBI);
    this.prefs.addObserver("",this,false);
    this.mozJSPref=prefserv.getBranch("javascript.").QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    this.mozJSPref.addObserver("enabled",this,false);
    
    const syncPrefNames=["pluginPlaceholder","allowClipboard","forbidPlugins","forbidJava","forbidFlash","temp","permanent"];
    for(var spcount=syncPrefNames.length; spcount-->0;) {
      this.syncPrefs(this.prefs,syncPrefNames[spcount]);
    }
    
    this.syncPrefs(this.mozJSPref,"enabled");
    
    const sites=this.sites=this.sites;
    const mozJSEnabled=this.mozJSEnabled;
    
    this.setJSEnabled(this.tempList,false,sites); // remove temporary
    this.setJSEnabled(this.permanentList,true,sites); // add permanent
    
    this.mozJSPref.setBoolPref("enabled",mozJSEnabled)
    
    const POLICY_NAME=this.POLICY_NAME;
    var prefArray;
    var prefString=null,originalPrefString=null;
    try { 
      prefArray=this.splitList(prefString=originalPrefString=this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      var pn;
      while(pcount-->0 && (pn=prefArray[pcount])!=POLICY_NAME);
      if(pcount==-1) {
        if(prefArray.length==0) {
          prefString=POLICY_NAME;
        } else {
          prefArray[prefArray.length]=POLICY_NAME;
          prefString=prefArray.join(' ');
        }
      }
      prefString=prefString.replace(/,/g,' ').replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
    } catch(ex) {
      prefString=POLICY_NAME;
    }
  
    if(prefString && (prefString!=originalPrefString)) { 
      this.caps.setCharPref("policynames",prefString);
      this.caps.setCharPref(POLICY_NAME+".javascript.enabled","allAccess");
    }
    
    this.reloadWhereNeeded(); // init snapshot
   
    this.uninstallGuard.init();
  }
,
  _indexOf: function(el,arr) {
    for(var j=arr.length; j-->0;) {
      if(arr[j]==el) break;
    }
    return j;
  }
,
  isPermanent: function(s) {
    return s &&
      (s=="chrome:" || s=="resource:" 
        || this._indexOf(s,this.permanentList)>-1);
  }
,
  tempList: [],
  isTemp: function(s) {
    return s && this._indexOf(s,this.tempList)>-1;
  }
,
  setTemp: function(s,b) {
    var tl=this.tempList;
    if(b) {
      tl.push(s);
    } else {
      for(var j; (j=this._indexOf(s,tl))>-1; tl.splice(j,1));
    }
    tl=this.sortedSiteSet(tl);
    this.setPref("temp",tl.join(" "));
  }
,
  splitList: function(s) {
    return s?/^[,\s]*$/.test(s)?[]:s.split(/\s*[,\s]\s*/):[];
  }
,
  savePrefs: function() {
    return this.prefService.savePrefFile(null);
  }
,
  get sitesString() {
    try {
      return this.caps.getCharPref(this.POLICY_NAME+".sites");
    } catch(ex) {
      return this.siteString=this.getPref("default",
        "chrome: resource: noscript.net gmail.google.com googlesyndication.com informaction.com maone.net mozilla.org mozillazine.org noscript.net hotmail.com msn.com passport.com passport.net passportimages.com");
    }
  }
,
  set sitesString(s) {
    s=s.replace(/,/g,' ').replace(/\s{2,}/g,' ').replace(/(^\s+|\s+$)/g,'');
    if(s!=this.siteString) {
      this.caps.setCharPref(this.POLICY_NAME+".sites",s);
    }
    return s;
  }
,
  _sites: null,
  get sites() {
    return this._sites?this._sites:this._sites=this.splitList(this.sitesString);
  }
,
  set sites(ss) {
    this.sitesString=(ss=this.sortedSiteSet(ss,true)).join(' ');
    return ss;
  }
,
  _domainPattern: /^[\w\-\.]*\w$/
,
  sortedSiteSet: function(ss,keepShortest) {
    const ns=this;
    ss.sort(function(a,b) {
      if(a==b) return 0;
      if(!a) return 1;
      if(!b) return -1;
      const dp=ns._domainPattern;
      return dp.test(a)?
        (dp.test(b)?(a<b?-1:1):-1)
        :(dp.test(b)?1:a<b?-1:1);
    });
    // sanitize and kill duplicates
    var prevSite=null;
    for(var j=ss.length; j-->0;) {
      var curSite=ss[j];
      if((!curSite) || curSite.toLowerCase().replace(/\s/g,'')==prevSite) { 
        ss.splice(j,1);
      } else {
        ss[j]=prevSite=curSite;
      }
    }
    return ss;
  }
,
  get jsEnabled() {
    try {
      return this.mozJSEnabled && this.caps.getCharPref("default.javascript.enabled") != "noAccess";
    } catch(ex) {
      return this.uninstalling?this.mozJSEnabled:(this.jsEnabled=this.getPref("global",false));
    }
  }
,
  set jsEnabled(enabled) {
    this.caps.setCharPref("default.javascript.enabled",enabled?"allAccess":"noAccess");
    this.setPref("global",enabled);
    if(enabled) {
      this.mozJSPref.setBoolPref("enabled",true);
    }
    return enabled;
  }
,
  _ios: null,
  get ios() {
     return this._ios?this._ios
      :this._ios=Components.classes["@mozilla.org/network/io-service;1"
        ].getService(Components.interfaces.nsIIOService);
  }
,
  getSite: function(url) {
    if(!url) return null;
    url=url.replace(/^\s+/,'').replace(/\s+$/,'');
    if(!url) return null;
    var scheme;
    try {
      scheme=this.ios.extractScheme(url);
      if(scheme=="javascript" || scheme=="data" || scheme=="about") return null;
      scheme+=":";
      if(url==scheme) return url;
    } catch(ex) {
      var domainMatch=url.match(this._domainPattern);
      return domainMatch?domainMatch[0].toLowerCase():null;
    }
    try {
      // let's unwrap JAR uris
      var uri=this.ios.newURI(url,null,null);
      if(uri instanceof Components.interfaces.nsIJARURI) {
        uri=uri.JARFile;
        return uri?this.getSite(uri.spec):scheme;
      }
      try  {
        return scheme+"//"+uri.hostPort;
      } catch(exNoHostPort) {
        return scheme;
      }
    } catch(ex) {
      return null;
    }
  }
,
  findMatchingSite: function(site,sites,visitor) {
    if(!site) return null;
    if(site.indexOf("chrome:/")==0) return "chrome:";
    if(!sites) sites=this.sites;
    const siteLen=site.length;
    var current,currentLen,lenDiff,charBefore;
    var matchFound;
    var ret=null;
    for(var j=sites.length; j-->0;) {
      current=sites[j];
      currentLen=current.length;
      lenDiff=siteLen-currentLen;
     
      if(lenDiff>=0 
        && (current==site 
           // subdomain matching
           || (lenDiff>0  
               && ( (charBefore=site.charAt(lenDiff-1))=="."
                    || (charBefore=="/" 
                      && (matchFound || current.indexOf(".")!=current.lastIndexOf(".")) 
                      // 2nd level domain policy lookup flaw 
                      )
                   )
               && site.substring(lenDiff)==current
               ) 
           )
      ) { 
        if(visitor) {
          matchFound=true;
          if(ret=visitor.visit(current,sites,j)) {
            return ret;
          }
        } else {
          return current;
        }
      }
    }
    return null;
  }
,
  findShortestMatchingSite: function(site,sites) {
    const shortestFinder={
      shortest: null, shortestLen: site.length,
      visit: function(current,sites,index) {
        if(this.shortestLen>=current.length) {
          this.shortestLen=current.length;
          this.shortest=current;
        }
      }
    };
    return this.findMatchingSite(site,sites,shortestFinder) || shortestFinder.shortest;
  }
,
  isJSEnabled: function(site,sites) {
    return this.isInPolicy(site,sites);
  }
,
  setJSEnabled: function(site,is,sites) {
    if(!site) return false;
    if(!sites) sites=this.sites;
    this.putInPolicy(site,is,sites);
    this.sites=sites;
    return is;
  }
,
  safeCapsOp: function(callback) {
    callback();
    this.savePrefs();
    this.reloadWhereNeeded();
  }
,
  isInPolicy: function(site,sites) {
    return this.findMatchingSite(site,sites,null)!=null; 
  }
,
  putInPolicy: function(site,included,sites) {
    if(typeof(site)=="object" && site.length) {
      for(var j=site.length; j-->0; this.putInPolicy(site[j],included,sites));
    } else if(site) {
      site=site.toString(); // ensure we're working with the right type
      
      if(site.indexOf(":")<0 && site.indexOf(".")==site.lastIndexOf(".")) {
       //2nd level domain hack
        this.putInPolicy("http://"+site,included,sites);
        this.putInPolicy("https://"+site,included,sites);
      }
      if(included==this.isInPolicy(site,sites)) { 
        return included;
      }
      if(included) {
        sites.push(site);
      } else {
        const siteKiller={
          visit: function(current,ss,index) {
            ss.splice(index,1);
            return null;
          }
        };
        this.findMatchingSite(site,sites,siteKiller);
      }
    }
    return included;
  }
,
  getAllWindows: function() {
     return Components.classes['@mozilla.org/appshell/window-mediator;1'].getService(
      Components.interfaces.nsIWindowMediator).getEnumerator(null);
  }
,
  _lastSnapshot: null,
  _lastGlobal: false,
  reloadWhereNeeded: function(snapshot,lastGlobal) {
    if(!snapshot) snapshot=this._lastSnapshot;
    const ss=this.sitesString;
    this._lastSnapshot=ss;
    const global=this.jsEnabled;
    if(typeof(lastGlobal)=="undefined") {
      lastGlobal=this._lastGlobal;
    }
    this._lastGlobal=global;
    if( (global==lastGlobal && ss==snapshot) || !snapshot) return false;
    
    if(!this.getPref("autoReload")) return false;
    
    const prevSites=this.sortedSiteSet(this.splitList(snapshot));
    const sites=this.sortedSiteSet(this.splitList(ss));
    const ww=this.getAllWindows();
    var ret=false;
    var ov,gb,bb,b,j,doc,docSites;
    var prevStatus,currStatus;
    for(var w; ww.hasMoreElements();) {
      w=ww.getNext();
      ov=w.noscriptOverlay;
      gb=w.getBrowser?w.getBrowser():null;
      if(ov && gb && (bb=gb.browsers)) {
        for(b=bb.length; b-->0;) {
          doc=ov.getBrowserDoc(bb[b]);
          if(doc) {
            docSites=ov.getSites(doc);
            for(j=docSites.length; j-- >0;) {
              prevStatus=(lastGlobal || this.isInPolicy(docSites[j],sites));
              currStatus=global || this.isInPolicy(docSites[j],prevSites);
              if(currStatus!=prevStatus) {
                ret=true;
                bb[b].reload();
                break;
              }
            }
          }
        }
      }
    }
    return ret;
  }
,
  SPECIAL_TLDS: {
    ab:" ca ", 
    ac:" ac at be cn il in jp kr nz th uk za ", 
    adm:" br ", adv:" br ",
    agro:" pl ",
    ah:" cn ",
    aid:" pl ",
    alt:" za ",
    am:" br ",
    arq:" br ",
    art:" br ",
    arts:" ro ",
    asn:" au au ",
    asso:" fr mc ",
    atm:" pl ",
    auto:" pl ",
    bbs:" tr ",
    bc:" ca ",
    bio:" br ",
    biz:" pl ",
    bj:" cn ",
    br:" com ",
    cn:" com ",
    cng:" br ",
    cnt:" br ",
    co:" ac at il in jp kr nz th uk za ",
    com:" au br cn ec fr hk mm mx pl ro ru sg tr tw ",
    cq:" cn ",
    cri:" nz ",
    ecn:" br ",
    edu:" au cn hk mm mx pl tr za ",
    eng:" br ",
    ernet:" in ",
    esp:" br ",
    etc:" br ",
    eti:" br ",
    eu:" com lv ",
    fin:" ec ",
    firm:" ro ",
    fm:" br ",
    fot:" br ",
    fst:" br ",
    g12:" br ",
    gb:" com net ",
    gd:" cn ",
    gen:" nz ",
    gmina:" pl ",
    go:" jp kr th ",
    gob:" mx ",
    gov:" br cn ec il in mm mx sg tr za ",
    govt:" nz ",
    gs:" cn ",
    gsm:" pl ",
    gv:" ac at ",
    gx:" cn ",
    gz:" cn ",
    hb:" cn ",
    he:" cn ",
    hi:" cn ",
    hk:" cn ",
    hl:" cn ",
    hn:" cn ",
    hu:" com ",
    id:" au ",
    ind:" br ",
    inf:" br ",
    info:" pl ro ",
    iwi:" nz ",
    jl:" cn ",
    jor:" br ",
    js:" cn ",
    k12:" il tr ",
    lel:" br ",
    ln:" cn ",
    ltd:" uk ",
    mail:" pl ",
    maori:" nz ",
    mb:" ca ",
    me:" uk ",
    med:" br ec ",
    media:" pl ",
    mi:" th ",
    miasta:" pl ",
    mil:" br ec nz pl tr za ",
    mo:" cn ",
    muni:" il ",
    nb:" ca ",
    ne:" jp kr ",
    net:" au br cn ec hk il in mm mx nz pl ru sg th tr tw za ",
    nf:" ca ",
    ngo:" za ",
    nm:" cn kr ",
    no:" com ",
    nom:" br pl ro za ",
    ns:" ca ",
    nt:" ca ro ",
    ntr:" br ",
    nx:" cn ",
    odo:" br ",
    on:" ca ",
    or:" ac at jp kr th ",
    org:" au br cn ec hk il mm mx nz pl ro ru sg tr tw uk za ",
    pc:" pl ",
    pe:" ca ",
    plc:" uk ",
    ppg:" br ",
    presse:" fr ",
    priv:" pl ",
    pro:" br ",
    psc:" br ",
    psi:" br ",
    qc:" ca com ",
    qh:" cn ",
    re:" kr ",
    realestate:" pl ",
    rec:" br ro ",
    rel:" pl ",
    res:" in ",
    sa:" com ",
    sc:" cn ",
    school:" nz za ",
    se:" com net ",
    sh:" cn ",
    shop:" pl ",
    sk:" ca ",
    sklep:" pl ",
    slg:" br ",
    sn:" cn ",
    sos:" pl ",
    store:" ro ",
    targi:" pl ",
    tj:" cn ",
    tm:" fr mc pl ro za ",
    tmp:" br ",
    tourism:" pl ",
    travel:" pl ",
    tur:" br ",
    turystyka:" pl ",
    tv:" br ",
    tw:" cn ",
    uk:" co com net ",
    us:" com ",
    uy:" com ",
    vet:" br ",
    web:" za ",
    www:" ro ",
    xj:" cn ",
    xz:" cn ",
    yk:" ca ",
    yn:" cn ",
    za:" com ",
    zj:" cn ", 
    zlg:" br "
  }
,
  cleanup: function() {
    this.cleanupIfUninstalling();
  }
,
  cleanupIfUninstalling: function() {
    if(this.uninstalling) this.uninstallJob();
    return this.uninstalling;
  }
,
  resetJSCaps: function() {
    try {
      this.caps.clearUserPref("default.javascript.enabled");
    } catch(ex) {}
    try {
      const POLICY_NAME=this.POLICY_NAME;
      var prefArray=this.splitList(this.caps.getCharPref("policynames"));
      var pcount=prefArray.length;
      const prefArrayTarget=[];
      for(var pcount=prefArray.length; pcount-->0;) {
        if(prefArray[pcount]!=POLICY_NAME) prefArrayTarget[prefArrayTarget.length]=prefArray[pcount];
      }
      var prefString=prefArrayTarget.join(" ").replace(/\s+/g,' ').replace(/^\s+/,'').replace(/\s+$/,'');
      if(prefString) {
        this.caps.setCharPref("policynames",prefString);
      } else {
        try {
          this.caps.clearUserPref("policynames");
        } catch(ex1) {}
      }
      this.savePrefs();
    } catch(ex) {
      // dump(ex);
    }
  }
,
  uninstallJob: function() {
    this.resetJSCaps();
  }
,
  getPref: function(name,def) {
    const IPC=Components.interfaces.nsIPrefBranch;
    const prefs=this.prefs;
    try {
      switch(prefs.getPrefType(name)) {
        case IPC.PREF_STRING:
          return prefs.getCharPref(name);
        case IPC.PREF_INT:
          return prefs.getIntPref(name);
        case IPC.PREF_BOOL:
          return prefs.getBoolPref(name);
      }
    } catch(e) {}
    return def;
  }
,
  setPref: function(name,value) {
    const prefs=this.prefs;
    switch(typeof(value)) {
      case "string":
          prefs.setCharPref(name,value);
          break;
      case "boolean":
        prefs.setBoolPref(name,value);
        break;
      case "number":
        prefs.setIntPref(name,value);
        break;
      default:
        throw new Error("Unsupported type "+typeof(value)+" for preference "+name);
    }
  }
,
  _sound: null,
  playSound: function(url,force) {
    if(force || this.getPref("sound",true)) {
      var sound=this._sound;
      if(sound==null) {
        sound=Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
        sound.init();
      }
      try {
        sound.play(this.ios.newURI(url,null,null));
      } catch(ex) {
        //dump(ex);
      }
    }
  }
,
  readFile: function(file) {
    const cc=Components.classes;
    const ci=Components.interfaces;  
    const is = cc["@mozilla.org/network/file-input-stream;1"].createInstance(
          ci.nsIFileInputStream );
    is.init(file ,0x01, 0400, null);
    const sis = cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      ci.nsIScriptableInputStream );
    sis.init(is);
    const res=sis.read(sis.available());
    is.close();
    return res;
  }
,
  writeFile: function(file, content) {
    const cc=Components.classes;
    const ci=Components.interfaces;
    const unicodeConverter = cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(
    ci.nsIScriptableUnicodeConverter);
    unicodeConverter.charset = "UTF-8";
    content=unicodeConverter.ConvertFromUnicode(content);
    const os=cc["@mozilla.org/network/file-output-stream;1"].createInstance(
      ci.nsIFileOutputStream);
    os.init(file, 0x02 | 0x08 | 0x20,0664,0);
    os.write(content,content.length);
    os.close();
  }
,
  get prompter() {
    return Components.classes["@mozilla.org/embedcomp/prompt-service;1"
          ].getService(Components.interfaces.nsIPromptService);
  }
,
  queryInterfaceSupport: function(iid,iids) { 
    xpcom_checkInterfaces(iid, iids, Components.results.NS_ERROR_NO_INTERFACE);
  }
,
  pluginPlaceholder: "chrome://noscript/skin/icon32.png",
  forbidSomePlugins: false,
  forbidAllPlugins: false,
  forbidJava: false,
  forbidFlash: false,
  forbidPlugins: false,
  pluginSitesCache: {},
  getPluginSites: function(uri) {
    const sc=this.pluginSitesCache;
    return uri?(uri in sc)?sc[uri]:sc[uri]={}:{};
  },
  // nsIContentPolicy interface
  // we use numeric constants for performance sake:
  // nsIContentPolicy.TYPE_SCRIPT = 2
  // nsIContentPolicy.TYPE_OBJECT = 5
  // nsIContentPolicy.TYPE_DOCUMENT = 6
  // nsIContentPolicy.TYPE_SUBDOCUMENT = 7
  // nsIContentPolicy.REJECT_SERVER = -3
  // nsIContentPolicy.ACCEPT = 1
  
  shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aInternalCall) {
    if(!this._lastGlobal) {
      var forbid;
      if(aContentType == 5 || ( forbid = (aContentType == 2) ) ) {
        var origin;
        if(!forbid) {
          // cache plugin sites as they (attempt to) load
          if(aRequestOrigin && !aInternalCall) {
            const sites=this.getPluginSites(aRequestOrigin.spec);
            const pluginURI=aContentLocation.spec;
            origin=this.getSite(pluginURI);
            if(origin) {
              // we construct an hash for each origin, containing the real URLs 
              // as properties and the total (unique) count for each plugin URL
              var pe=sites[origin];
              if(!pe) {
                sites[origin]=pe={pluginCount: 1};
                pe[pluginURI]=true;
              } else {
                if(!pe[pluginURI]) {
                  pe[pluginURI]=true;
                  pe.pluginCount++;
                }
              }
            }
          }
          
          if(this.forbidSomePlugins) {
            var forbid=this.forbidAllPlugins;
            if((!forbid) && aMimeTypeGuess) {
              const isFlash=aMimeTypeGuess=="application/x-shockwave-flash";
              if(isFlash) {
                forbid=this.forbidFlash;
              } else {
                const isJava=aMimeTypeGuess.indexOf("application/x-java-")==0;
                if(isJava) {
                  forbid=this.forbidJava;
                } else {
                  forbid=this.forbidPlugins;
                }
              }
            }
          }
        }
        if(forbid) {
          if(!origin) origin=this.getSite(aContentLocation.spec);
          if(!this.isInPolicy(origin)) {
            if(aContext) {
              const lm=Components.lookupMethod;
              const ci=Components.interfaces;
              var setAttr,getAttr;
              if(aContext instanceof ci.nsIDOMHTMLAppletElement) {
                  (setAttr=lm(aContext,"setAttribute"))("code","java.applet.Applet");
              }
              if(this.pluginPlaceholder) {
                if(aContext instanceof Components.interfaces.nsIDOMNode) {
                  if(aContext instanceof(ci.nsIDOMHTMLEmbedElement)) {
                    var parent=lm(aContext,"parentNode")();
                    if(parent instanceof ci.nsIDOMHTMLObjectElement) {
                      aContext=parent;
                      setAttr=null;
                    }
                  }
                  
                  getAttr=lm(aContext,"getAttribute");
                  if(!setAttr) setAttr=lm(aContext,"setAttribute");
                  
                  var clazz=getAttr("class");
                  if((!clazz) || clazz.indexOf("-noscript-blocked")<0) {
                    setAttr("class",clazz?clazz+" -noscript-blocked":"-noscript-blocked");
                  
                    var title=(aMimeTypeGuess?aMimeTypeGuess.replace("application/","")+"@":"@")+origin;
                    var desc=getAttr("alt");
                    setAttr("title",desc?title+" \""+desc+"\"":title);
                  }
                }
              }
            }
            dump("NoScript blocked "+aContentLocation.spec+" which is a "+aMimeTypeGuess+" from "+origin);
            return -3;
          }
        }
      }
    }
    return 1;
  }
,
  shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra) {
    return this.shouldLoad(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, true);
  }
};


// XPCOM Scaffolding code

// component defined in this file
const EXTENSION_ID="{73a6fe31-595d-460b-a920-fcc0f8843232}";
const SERVICE_NAME="NoScript Service";
const SERVICE_ID="{31aec909-8e86-4397-9380-63a59e0c5ff5}";
const SERVICE_CTRID = "@maone.net/noscript-service;1";
const SERVICE_CONSTRUCTOR=NoscriptService;

const SERVICE_CID = Components.ID(SERVICE_ID);

// interfaces implemented by this component
const SERVICE_IIDS = 
[ 
Components.interfaces.nsIObserver,
Components.interfaces.nsISupports,
Components.interfaces.nsISupportsWeakReference,
Components.interfaces.nsIContentPolicy
];

// categories which this component is registered in
const SERVICE_CATS = ["app-startup","content-policy"];


// Factory object
const SERVICE_FACTORY = {
  _instance: new SERVICE_CONSTRUCTOR(),
  createInstance: function (outer, iid) {
    if (outer != null)
        throw Components.results.NS_ERROR_NO_AGGREGATION;

    xpcom_checkInterfaces(iid,SERVICE_IIDS,Components.results.NS_ERROR_INVALID_ARG);
    // kept this for flexibility sake, but we're really adopting an
    // early instantiation and late init singleton pattern
    return this._instance==null?this._instance=new SERVICE_CONSTRUCTOR():this._instance;
  }
};

function xpcom_checkInterfaces(iid,iids,ex) {
  for(var j=iids.length; j-- >0;) {
    if(iid.equals(iids[j])) return true;
  }
  throw ex;
}

// Module

var Module = new Object();
Module.firstTime=true;
Module.registerSelf = function (compMgr, fileSpec, location, type) {
  if(this.firstTime) {
   
    debug("*** Registering "+SERVICE_CTRID+".\n");
    
    compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar
      ).registerFactoryLocation(SERVICE_CID,
      SERVICE_NAME,
      SERVICE_CTRID, 
      fileSpec,
      location, 
      type);
    const catman = Components.classes['@mozilla.org/categorymanager;1'
      ].getService(Components.interfaces.nsICategoryManager);
    for(var j=0, len=SERVICE_CATS.length; j<len; j++) {
      catman.addCategoryEntry(SERVICE_CATS[j],
        //SERVICE_NAME, "service," + SERVICE_CTRID, 
        SERVICE_CTRID, SERVICE_CTRID, true, true, null);
    }
    this.firstTime=false;
  } 
}
Module.unregisterSelf = function(compMgr, fileSpec, location) {
  compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar
    ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
  const catman = Components.classes['@mozilla.org/categorymanager;1'
      ].getService(Components.interfaces.nsICategoryManager);
  for(var j=0, len=SERVICE_CATS.length; j<len; j++) {
    catman.deleteCategoryEntry(SERVICE_CATS[j], SERVICE_CTRID, true);
  }
}

Module.getClassObject = function (compMgr, cid, iid) {
  if(cid.equals(SERVICE_CID))
    return SERVICE_FACTORY;

  if (!iid.equals(Components.interfaces.nsIFactory))
    throw Components.results.NS_ERROR_NOT_IMPLEMENTED;
  
  throw Components.results.NS_ERROR_NO_INTERFACE;
    
}

Module.canUnload = function(compMgr) {
  return true;
}

// entrypoint
function NSGetModule(compMgr, fileSpec) {
  return Module;
}


