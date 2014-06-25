var Bug = {
  
};

{
  let lazy = {
    $677643: "8.0",
    $677050: ["6.0", "18.0"], 
    $771655: "20",
    $789773: "19",
  }
  for (let b in lazy) {
    let v = lazy[b];
    Bug.__defineGetter__(b, function() {
      delete this[b];
      return this[b] = (typeof v[0] === "object")
       ? ns.geckoVersionCheck(v[0]) >= 0 && ns.geckoVersionCheck(v[1]) < 0 
       : ns.geckoVersionCheck(v) < 0;
    });
  }
}