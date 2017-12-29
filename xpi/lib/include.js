var include = (() =>
{
  let  _inclusions = new Set();

  function scriptLoader(src) {
    let script = document.createElement("script");
    script.src = src;
    return script;
  }

  function styleLoader(src) {
    let style = document.createElement("link");
    style.rel = "stylesheet";
    style.type = "text/css";
    style.href = src;
    return style;
  }

  return async function include(src) {
    if (_inclusions.has(src)) return;
    if (Array.isArray(src)) {
      return await Promise.all(src.map(s => include(s)));
    }
    debug("Including", src);
    _inclusions.add(src);
    return await new Promise((resolve, reject) => {
      let inc = src.endsWith(".css") ? styleLoader(src) : scriptLoader(src);
      inc.onload = () => resolve(inc);
      inc.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(inc);
    });
  }
})();
