var Test = (() => {
  'use strict';
  return {
    passed: 0,
    failed: 0,
    async include(...args) {
      for(let test of args) {
        let src = `/test/${test}_test.js`;
        log(`Testing ${test}`);
        this.passed = this.failed = 0;
        await include(src);
        let {passed, failed} = this;
        log(`FAILED: ${failed}, PASSED: ${passed}, TOTAL ${passed + failed}.`);
      }
    },
    async run(test, msg = "", callback = null) {
      let r = false;
      try {
        r = await test();
      } catch(e) {
        error(e);
      }
      this[r ? "passed" : "failed"]++;
      log(`${r ? "PASSED" : "FAILED"} ${msg || uneval(test)}`);
      if (typeof callback === "function") try {
        callback(r, test, msg);
      } catch(e) {
        error(e);
      }
    }
  };
})();
