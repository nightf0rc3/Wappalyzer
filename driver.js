const Wappalyzer = require('./wappalyzer');
const url = require('url');

function sleep(ms) {
  return ms ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve();
}

function processJs(window, patterns) {
  const js = {};

  Object.keys(patterns).forEach((appName) => {
    js[appName] = {};

    Object.keys(patterns[appName]).forEach((chain) => {
      js[appName][chain] = {};

      patterns[appName][chain].forEach((pattern, index) => {
        const properties = chain.split('.');

        let value = properties
          .reduce((parent, property) => (parent && parent[property]
            ? parent[property] : null), window);

        value = typeof value === 'string' || typeof value === 'number' ? value : !!value;

        if (value) {
          js[appName][chain][index] = value;
        }
      });
    });
  });

  return js;
}

function processHtml(html, maxCols, maxRows) {
  if (maxCols || maxRows) {
    const chunks = [];
    const rows = html.length / maxCols;

    let i;

    for (i = 0; i < rows; i += 1) {
      if (i < maxRows / 2 || i > rows - maxRows / 2) {
        chunks.push(html.slice(i * maxCols, (i + 1) * maxCols));
      }
    }

    html = chunks.join('\n');
  }

  return html;
}

class Driver {
  constructor(Browser, options) {
    this.options = Object.assign({}, {
      debug: false,
      htmlMaxCols: 2000,
      htmlMaxRows: 3000,
      userAgent: 'Mozilla/5.0',
      apps: [],
      categories: [],
      forwardHtml: false
    }, options || {});

    this.options.debug = Boolean(+this.options.debug);
    this.options.htmlMaxCols = parseInt(this.options.htmlMaxCols, 10);
    this.options.htmlMaxRows = parseInt(this.options.htmlMaxRows, 10);

    this.Browser = Browser;

    this.wappalyzer = new Wappalyzer();

    if (this.options.apps.length === 0 || this.options.categories.length === 0) {
      throw new Error('App Object has to be provided');
    }
    this.wappalyzer.apps = this.options.apps;
    this.wappalyzer.categories = this.options.categories;

    this.wappalyzer.parseJsPatterns();
  }

  analyze(origUrl, delay) {
    var pageUrl = url.parse(origUrl)
    return new Promise(async (resolve, reject) => {
        await sleep(delay);
        this.visit(pageUrl, resolve, reject);
    });
  }

  async visit(pageUrl, resolve, reject) {
    const browser = new this.Browser(this.options);
    browser.log = (message, type) => this.wappalyzer.log(message, 'browser', type);
    await browser.visit(pageUrl.href);

    // Validate response
    if (!browser.statusCode) {
      return resolve({status: browser.statusCode});
    }

    if (!browser.contentType || !/\btext\/html\b/.test(browser.contentType)) {
      return resolve({status: browser.statusCode, error: 'NO_HTML_RESPONSE'});
    }

    const { cookies, headers, scripts } = browser;

    const html = processHtml(browser.html, this.options.htmlMaxCols, this.options.htmlMaxRows);
    const js = processJs(browser.js, this.wappalyzer.jsPatterns);

    pageUrl.canonical = `${pageUrl.protocol}//${pageUrl.host}${pageUrl.pathname}`;

    const result = await this.wappalyzer.analyze(pageUrl, {
      cookies,
      headers,
      html,
      js,
      scripts,
    }, { forwardHtml: this.options.forwardHtml });
    resolve({apps: result.apps, status: browser.statusCode, context: result.context});
  }
}

module.exports = Driver;
module.exports.processJs = processJs;
module.exports.processHtml = processHtml;
