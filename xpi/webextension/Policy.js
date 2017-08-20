"use strict";

class Policy {
  constructor(settings = {}) {
    this.settings = settings;
  }

  getPermissionsFor(url) {
  }

  isAllowed(url, type) {
    if (!(policy && policy.enforced)) {
        return true;
      }
      let url = new URL(urlString);
      return url.origin in policy.origins && policy.origins[url.origin].js;
  }
}

