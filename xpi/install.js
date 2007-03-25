const APP_DISPLAY_NAME = "NoScript";
const APP_NAME = "noscript";
const APP_PACKAGE = "/informaction/noscript";
const APP_VERSION = "1.1.2.20050901";

const APP_PREFS_FILE="defaults/preferences/noscript.js";
const APP_XPCOM_SERVICE="components/noscriptService.js";
const APP_JAR_FILE = "noscript.jar";
const APP_CONTENT_FOLDER = "content/noscript/";
const APP_LOCALES = [
  "es-ES","pt-PT", "pt-BR", "de-DE","fr-FR","it-IT","nl-NL","en-US"
  ];

const APP_SUCCESS_MESSAGE = APP_DISPLAY_NAME+" should now be available when you restart Mozilla.";

const INST_TO_PROFILE = "Do you wish to install "+APP_DISPLAY_NAME+" to your profile?\nThis will mean it does not need reinstalling when you update Mozilla.\n(Click Cancel if you want "+APP_DISPLAY_NAME+" installing to the Mozilla directory.)";


var err;
initInstall(APP_NAME, APP_PACKAGE, APP_VERSION);

// profile installs only work since 2003-03-06
var instToProfile = (buildID>2003030600 && confirm(INST_TO_PROFILE));

var chromef = instToProfile ? getFolder("Profile", "chrome") : getFolder("chrome");
err = addFile(APP_PACKAGE, APP_VERSION, "chrome/" + APP_JAR_FILE, chromef, null);

if(APP_PREFS_FILE && (err == SUCCESS) ) {
  const prefDirs=[
    getFolder(getFolder("Profile"),"pref"),
    getFolder(getFolder(getFolder("Program"),"defaults"),"pref")
    ];
  for(var j=prefDirs.length; j-->0;) {
    var prefDir=prefDirs[j];
    if(!File.exists(prefDir)) {
      File.dirCreate(prefDir);
    }
    err = addFile(APP_PACKAGE, APP_VERSION,  APP_PREFS_FILE, prefDir, null, true);
    logComment("Adding "+APP_PREFS_FILE+" in "+prefDir+": exit code = "+err);
  }
}

if(err == SUCCESS) {
	var jar = getFolder(chromef, APP_JAR_FILE);
	const chromeFlag=instToProfile?PROFILE_CHROME:DELAYED_CHROME;
 
  registerChrome(CONTENT | chromeFlag, jar, APP_CONTENT_FOLDER);
  var localesCount=APP_LOCALES.length;
  if(localesCount>0) {
    registerChrome(LOCALE | chromeFlag, jar, "content/noscript/"+APP_LOCALES[--localesCount]+"/");
    while(localesCount-- >0) {
      registerChrome(LOCALE  | chromeFlag, jar, "locale/"+APP_LOCALES[localesCount]+"/noscript/");
    }
  }
  registerChrome(SKIN | chromeFlag, jar, "skin/classic/noscript/");
  
  
  if(APP_XPCOM_SERVICE) {
    var componentsDir = getFolder("Components");
    addFile(APP_PACKAGE,APP_VERSION, APP_XPCOM_SERVICE, componentsDir, null, true);
    // addFile(APP_NAME, "components/.autoreg", getFolder("Program"), "");
  }
  
  err = performInstall();
  if(err == SUCCESS || err == 999) {
    alert(APP_DISPLAY_NAME+" "+APP_VERSION+" has been succesfully installed.\n"+APP_SUCCESS_MESSAGE);
  } else {
    alert("Install failed!!! Error code:" + err);
    cancelInstall(err);
  }
} else {
alert("Failed to create " +APP_JAR_FILE +"\n"
  +"You probably don't have appropriate permissions \n"
  +"(write access to your profile or chrome directory). \n"
  +"_____________________________\nError code:" + err);
cancelInstall(err);
}