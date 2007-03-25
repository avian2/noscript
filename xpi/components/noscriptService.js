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
      this.prefs.removeObserver("permanent",this);
      this.mozJSPref.removeObserver("enabled",this,false);
      this.uninstallGuard.dispose();
    }
  }
,
  syncPrefs: function(branch,name) {
    switch(name) {
      case "permanent":
        const permanentList=this.splitList(this.getPref("permanent",
          "googlesyndication.com noscript.net maone.net informaction.com noscript.net"));
        permanentList[permanentList.length]="chrome:";
        this.permanentList=this.sortedSiteSet(permanentList);
      break;
      case "temp":
        this.tempList=this.splitList(this.getPref("temp"),"");
        break;
      case "enabled":
        try {
          this.mozJSEnabled=this.mozJSPref.getBoolPref("enabled");
        } catch(ex) {
          this.mozJSEnabled=true;
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
    this.prefs=prefserv.getBranch("noscript.").QueryInterface(PBI);
    this.prefs.addObserver("permanent",this,false);
    this.mozJSPref=prefserv.getBranch("javascript.").QueryInterface(Components.interfaces.nsIPrefBranchInternal);
    this.mozJSPref.addObserver("enabled",this,false);
    
    this.syncPrefs(this.prefs,"permanent");
    this.syncPrefs(this.prefs,"temp");
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
      (s=="chrome:" 
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
        "chrome: noscript.net gmail.google.com googlesyndication.com informaction.com maone.net mozilla.org mozillazine.org noscript.net hotmail.com msn.com passport.com passport.net passportimages.com");
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
  get sites() {
    return this.splitList(this.sitesString);
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
    ss=ss.sort(function(a,b) {
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
    } catch(ex) {
      var domainMatch=url.match(this._domainPattern);
      return domainMatch?domainMatch[0].toLowerCase():null;
    }
    try {
      const uri=this.ios.newURI(url,null,null);
      var port;
      try {
        port=uri.port;
      } catch(noportEx) { 
        port=-1; 
      }
      var host;
      try {
        host="//"+uri.host;
      } catch(nohostEx) {
        host="";
      }
      return port>0?scheme+host+":"+port:scheme+host;
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
  delayExec: function(callback,delay) {
     const timer=Components.classes["@mozilla.org/timer;1"].createInstance(
        Components.interfaces.nsITimer);
     timer.initWithCallback( { notify: callback }, 1, 0);
  }
,
  _safeClosure: function() {
    this.reloadWhereNeeded();
    this.savePrefs();
  }
,
  safeCapsOp: function(callback) {
    if(this.getPref("stop",true)) this.stopAll();
    const serv=this;
    this.delayExec(function() {
     callback();
     serv.delayExec(
     function() {
       serv.savePrefs();
       serv.reloadWhereNeeded();
     },1)
    });
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
      site=new String(site);
      
      if(site.indexOf(":")<0 && site.indexOf(".")==site.lastIndexOf(".")) {
       //2nd level domain hack
        this.putInPolicy("http://"+site,included,sites);
        this.putInPolicy("https://"+site,included,sites);
      }
      if(included==this.isInPolicy(site,sites)) { 
        return included;
      }
      if(included) {
        sites[sites.length]=site;
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
      gb=w.gBrowser;
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
  stopAll: function() {
    const ww=this.getAllWindows();
    var gb,bb,j,b;
    for(var w; ww.hasMoreElements();) {
      w=ww.getNext();
      if( (gb=w.gBrowser) && (bb=gb.browsers) ) {
         for(j=bb.length; j-->0;) {
           b=bb[j];
           dump("Stopping "+((b.currentURI)?b.currentURI.spec:"a browser")+" ...");
           try {
             b.stop();
             dump("stopped\n");
           } catch(ex) {
             dump(ex);
           }
         }
      }
    }
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
  playSound: function(url) {
    if(this.getPref("sound",true)) {
      var sound=this._sound;
      if(sound==null) {
        sound=Components.classes["@mozilla.org/sound;1"].createInstance(Components.interfaces.nsISound);
        sound.init();
      }
      try {
        sound.play(this.ios.newURI(url,null,null));
      } catch(ex) {
        dump(ex);
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
Components.interfaces.nsISupportsWeakReference
];

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
      
    Components.classes['@mozilla.org/categorymanager;1'].getService(
      Components.interfaces.nsICategoryManager
     ).addCategoryEntry("app-startup",
        SERVICE_NAME, "service," + SERVICE_CTRID, true, true, null);
      
    this.firstTime=false;
  } 
}
Module.unregisterSelf = function(compMgr, fileSpec, location) {
  compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar
    ).unregisterFactoryLocation(SERVICE_CID, fileSpec);
  Components.classes['@mozilla.org/categorymanager;1'].getService(
      Components.interfaces.nsICategoryManager
     ).deleteCategoryEntry("app-startup",SERVICE_NAME, true);
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


