{
  Promise.all([
    async () => await XSS.maybe({originUrl: "https://maone.net", url: "https://noscript.net/<script", method: "GET"}),
    async () => !(await XSS.maybe({originUrl: "https://noscript.net", url: "https://noscript.net/<script", method: "GET"})),
    ].map(t => Test.run(t))
  );
}
