(async () => {
  await include("/test/Test.js");
  Test.include("Policy");
  Test.include("XSS");
})();
