const APP_DISPLAY_NAME = "NoScript";
const APP_NAME = "noscript";
const APP_PACKAGE = "/informaction/noscript";
const APP_VERSION = "1.9.1.4";

const APP_PREFS_FILE="defaults/preferences/noscript.js";
const APP_XPCOM_SERVICE="components/noscriptService.js";
const APP_JAR_FILE = "noscript.jar";
const APP_CONTENT_FOLDER = "content/noscript/";
const APP_LOCALES = [
  "es-ES","cs-CZ","pl-PL","ja-JP","ca-AD","pt-PT","pt-BR","de-DE","nb-NO",
  "fi-FI","fr-FR","it-IT","nl-NL","tr-TR","zh-CN","ru-RU","bg-BG","ro-RO",
  "uk-UA", "th-TH", "fa-IR", "el-GR", "hr-HR", "he-IL", "be-BY", "vi-VN",
  "sk-SK", "hu-HU", "mk-MK", "da-DK", "sv-SE", "lt-LT", "zh-TW", // "sr-YU",
  "id-ID", "es-AR", "ar", "de-AT", "ko-KR", "et-EE", // "sl-SI",
  "en-US"
  ];

const APP_SUCCESS_MESSAGE = APP_DISPLAY_NAME + " should now be available when you restart the browser.";

const INST_TO_PROFILE = "Do you wish to install " + APP_DISPLAY_NAME + 
  " to your profile?\nIf you are in doubt, this is the preferred option: click OK.\n(Click Cancel if you want " + 
  APP_DISPLAY_NAME + " installing to the Mozilla directory.)";

var instToProfile = true;

myPerformInstall(false);

function myPerformInstall(secondTry) {
  
  
  
  var err;
  initInstall(APP_NAME, APP_PACKAGE, APP_VERSION);
  
  function chromeExistsIn(folder) {
    var chrome = getFolder(folder, APP_JAR_FILE);
    var isDir = File.isDirectory(chrome);
    if (!isDir) isDir = chrome && chrome.toString().slice(-1) == '/';
    if (isDir)
      File.dirRemove(chrome);  
    return !chrome || !isDir;
  }
  
  if(!secondTry) {  
    // profile installs only work since 2003-03-06
    instToProfile = chromeExistsIn(getFolder("Profile", "chrome")) ||
      !chromeExistsIn(getFolder("chrome")) && 
        buildID > 2003030600 && !!confirm(INST_TO_PROFILE);
  }

  var chromef = instToProfile ? getFolder("Profile", "chrome") : getFolder("chrome");
  err = addFile(APP_PACKAGE, APP_VERSION, "chrome/" + APP_JAR_FILE, chromef, null);
  
  if(APP_PREFS_FILE && (err == SUCCESS) ) {
    const prefDirs=[
      getFolder(getFolder("Profile"),"pref"),
      getFolder(getFolder(getFolder("Program"),"defaults"),"pref")
      ];
    for(var j = prefDirs.length; j-->0;) {
      var prefDir = prefDirs[j];
      if(!File.exists(prefDir)) {
        File.dirCreate(prefDir);
      }
      err = addFile(APP_PACKAGE, APP_VERSION,  APP_PREFS_FILE, prefDir, null, true);
      logComment("Adding "+APP_PREFS_FILE+" in "+prefDir+": exit code = "+err);
    }
  }
  
  if(err == SUCCESS) {
    var jar = getFolder(chromef, APP_JAR_FILE);
    const chromeFlag = instToProfile ? PROFILE_CHROME : DELAYED_CHROME;
  
    registerChrome(CONTENT | chromeFlag, jar, APP_CONTENT_FOLDER);
    var localesCount=APP_LOCALES.length;
    if(localesCount>0) {
      registerChrome(LOCALE | chromeFlag, jar, "content/noscript/"+APP_LOCALES[--localesCount]+"/");
      while(localesCount-- >0) {
        registerChrome(LOCALE  | chromeFlag, jar, "locale/"+APP_LOCALES[localesCount]+"/noscript/");
      }
    }
    registerChrome(SKIN | chromeFlag, jar, "skin/classic/noscript/");
    
    var xpcomError = SUCCESS;
    if(APP_XPCOM_SERVICE) {
      var componentsDir = getFolder("Components");
      err = addFile(APP_NAME, ".autoreg", getFolder("Program"), "");
      xpcomError = addFile(APP_PACKAGE,APP_VERSION, APP_XPCOM_SERVICE, componentsDir, null, true);
    }
    
    err = performInstall();
    if(err == -239 && !secondTry) {
      alert("Chrome registration problem, maybe transient, retrying...");
      cancelInstall(err);
      myPerformInstall(true);
      return;
    }
    if(err == SUCCESS || err == 999) {
      if(xpcomError != SUCCESS) {
        alert("*** WARNING: PARTIAL INSTALLATION ***\n" +
              "A component requiring permissions to write in the SeaMonkey program directory couldn't be installed.\n"+
              "You will need either to reinstall " + APP_DISPLAY_NAME + " once as Administrator / root or install SeaMonkey in an user-writable location.");
        err = xpcomError;
      } else {
        alert(APP_DISPLAY_NAME+" "+APP_VERSION+" has been succesfully installed in your " + 
          (instToProfile ? "profile" : "browser") +
          ".\n" + APP_SUCCESS_MESSAGE);
      }
    } else {
      var msg = "Install failed!!! Error code:" + err;

      if(err == -239) {
        msg += "\nThis specific error is usually transient:"
          +"\nif you retry to install again, it will probably go away."
      }

      alert(msg);
      cancelInstall(err);
    }
  } else {
    alert("Failed to create " +APP_JAR_FILE +"\n"
      +"You probably don't have appropriate permissions \n"
      +"(write access to your profile or chrome directory). \n"
      +"_____________________________\nError code:" + err);
    cancelInstall(err);
  }
}