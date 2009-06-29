// language utilities

const Lang = {
  memoize: function(obj, funcs) {
    for (var p in funcs) {
      this._memoizeMember(obj, p, funcs[p]);
    }
    return obj;
  },
  _memoizeMember: function(obj, prop, func) {
    obj.__defineGetter__(prop, function() {
      var r = func.apply(this);
      this.__defineGetter__(prop, function() { return r; })
			return r;
		});
  }
}