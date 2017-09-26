var EXPORTED_SYMBOLS = ["NO_CACHE", "IMPORT_FOR", "UNLOAD", "UNLOAD_ALL", "BASE_URL"];

let { utils: Cu } = Components;

let BASE_URL = "chrome://noscript/content/";
let toURL = name => `${name}.jsm`;

let _NO_CACHE_KEY = Date.now().toString(32).concat(Math.random().toString(32).substring(2));

function NO_CACHE(url) {
  return `${BASE_URL}${url}?${_NO_CACHE_KEY}`;
}

let _MODULES = new Set();

function IMPORT_FOR(scope) {
  return name => {
    let url = NO_CACHE(toURL(name));
    _MODULES.add(url);
    return Cu.import(url, scope);
  };
}

function UNLOAD(name) {
  Cu.unload(NO_CACHE(toURL(name)));
}
function UNLOAD_ALL() {
  for (let m of _MODULES) Cu.unload(m);
  UNLOAD("importer");
}
