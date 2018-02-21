var Membrane = {
  create(real, wrap) {
    let shadow = {};
    return new Proxy(shadow, {
      get: function(target, propKey, receiver) {
        var pd = Object.getOwnPropertyDescriptor(real, propKey);
        if (pd !== undefined && !pd.configurable && !pd.writable) {
          Object.defineProperty(target, propKey, {
             value: wrap(real, propKey, receiver),
             writable: false,
             configurable: false,
             enumerable: pd.enumerable
          });
          return target[propKey];
       }
       return wrap(real, propKey, receiver);
      }
    });
  }
};
