var PlaceHolder = (() => {


  const HANDLERS = new Map();

  class Handler {
    constructor(type, selector) {
      this.type = type;
      this.selector = selector;
      this.placeHolders = new Map();
      HANDLERS.set(type, this);
    }
    filter(element, request) {
      let url = request.initialUrl || request.url;
      return "data" in element ? element.data === url : element.src === url;
    }
  }

  new Handler("frame", "iframe");
  new Handler("object", "object, embed");
  new Handler("media", "video, audio");


  function cloneStyle(src, dest,
    props = ["width", "height", "position", "*", "margin*"]) {
    var suffixes = ["Top", "Right", "Bottom", "Left"];
    for (let i = props.length; i-- > 0;) {
      let p = props[i];
      if (p.endsWith("*")) {
        let prefix = p.substring(0, p.length - 1);
        props.splice(i, 1, ...
               (suffixes.map(prefix ? (suffix => prefix + suffix)
                           : suffix => suffix.toLowerCase())));
      }
    };

    let srcStyle = window.getComputedStyle(src, null);
    let destStyle = dest.style;
    for (let p of props) {
      destStyle[p] = srcStyle[p];
    }
    destStyle.display = srcStyle.display !== "block" ? "inline-block" : "block";
  }

  class PlaceHolder {

    static create(policyType, request) {
      return new PlaceHolder(policyType, request);
    }
    static canReplace(policyType) {
      return HANDLERS.has(policyType);
    }

    static listen() {
      PlaceHolder.listen = () => {};
      window.addEventListener("click", ev => {
        if (ev.button === 0) {
          let replacement = ev.target.closest("a.__NoScript_PlaceHolder__");
          let ph = replacement && ev.isTrusted && replacement._placeHolderObj;
          if (ph) {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.target.value === "close") {
              ph.close(replacement);
            } else {
              ph.enable(replacement);
            }
          }
        }
      }, true, false);
    }

    constructor(policyType, request) {
      this.policyType = policyType;
      this.request = request;
      this.replacements = new Set();
      this.handler = HANDLERS.get(policyType);
      if (this.handler) {
        [...document.querySelectorAll(this.handler.selector)]
          .filter(element => this.handler.filter(element, request))
          .forEach(element => this.replace(element));
        };
        if (this.replacements.size) PlaceHolder.listen();
      }

      replace(element) {
        let {url} = this.request;
        this.origin = new URL(url).origin;
        let TYPE = `<${this.policyType.toUpperCase()}>`;

        let replacement = document.createElement("a");
        replacement.className = "__NoScript_PlaceHolder__";
        cloneStyle(element, replacement);
        replacement.style.backgroundImage = `url(${browser.extension.getURL("/img/icon256.png")})`;
        replacement.href = url;
        replacement.title = `${TYPE}@${url}`;

        let inner = replacement.appendChild(document.createElement("span"));
        inner.className = replacement.className;

        let button = inner.appendChild(document.createElement("button"));
        button.className = replacement.className;
        button.setAttribute("aria-label", button.title = _("Close"));
        button.value = "close";
        button.textContent = "🗙";

        let description = inner.appendChild(document.createElement("span"));
        description.textContent = `${TYPE}@${origin}`;

        replacement._placeHolderObj = this;
        replacement._placeHolderElement = element;
        this.replacements.add(replacement);

        element.parentNode.replaceChild(replacement, element);
      }

      async enable(replacement) {
        debug("Enabling %o", this.request, this.policyType);
        let ok = await browser.runtime.sendMessage(
          {type: "enable",
          url: this.request.url,
          policyType: this.policyType,
          documentUrl: document.URL
        });
        debug("Received response", ok);
        if (!ok) return;
        if (this.request.embeddingDocument) {
          window.location.reload();
          return;
        }
        try {
          var element = replacement._placeHolderElement;
          replacement.parentNode.replaceChild(element, replacement);
          this.replacements.delete(replacement);
        } catch(e) {
           error(e, "While replacing");
        }
      }

      close(replacement) {
        replacement.classList.add("closing");
        this.replacements.delete(replacement);
        window.setTimeout(() => replacement.parentNode.removeChild(replacement), 500);
      }
    }


  return PlaceHolder;
})();
