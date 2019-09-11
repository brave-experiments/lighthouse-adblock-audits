'use strict';

const Gatherer = require('lighthouse').Gatherer;
const pageFunctions = require('./lib/page-functions.js');
const fs = require('fs');
const URL = require('url').URL;

async function loadCookieRules(url) {
  let contents = fs.readFileSync('./blocklists/adguard-cookies.txt', {encoding: 'UTF-8'});
  let rules = contents.split('\n').filter(rule => rule.includes('#%#'))
  let allRules = rules
      .map(rule => {
        let split = rule.split('#%#')
        let domains = split[0].split(',')
        let script = split[1]
        if (script.includes('AG_onLoad')) {
          script = script.replace('AG_onLoad(', '(')
          script = script.replace(new RegExp("\\);*$"), ')()');
        }
        return {
          domains,
          script
        }
      })
  let domain = (new URL(url)).hostname;
  return allRules.filter(r => r.domains.some(d => domain.includes(d)))
}

async function loadConsentSelectors(url) {
  let contents = fs.readFileSync('./blocklists/consent-selectors.json', {encoding: 'UTF-8'});
  let selectors = JSON.parse(contents);
  return selectors.map(s => {
    s.hostname = (new URL(s.url)).hostname
    return s
  })
}

function chooseContentSelectors(url, selectors) {
  return selectors.filter(s => {
    let frameHost = (new URL(url)).hostname
    return frameHost.includes(s.hostname)
  })
}

async function consentDom(driver) {
  const {frameTree} = await driver.sendCommand('Page.getFrameTree');
  let toVisit = [frameTree];
  /* @type {Map<string | undefined, LH.Crdp.Page.Frame | undefined>} */
  const framesById = new Map();

  while (toVisit.length) {
    const frameTree = toVisit.shift();
    // console.log("Visiting frametree", frameTree);
    // Should never be undefined, but needed for tsc.
    if (!frameTree) continue;
    if (framesById.has(frameTree.frame.id)) {
      // DOM ID collision, mark as undefined.
      framesById.set(frameTree.frame.id, undefined);
    } else {
      framesById.set(frameTree.frame.id, frameTree.frame);
    }

    // Add children to queue.
    if (frameTree.childFrames) {
      toVisit = toVisit.concat(frameTree.childFrames);
    }
  }

  return [...framesById.values()]
}

async function executeIn(driver, frame, expression) {
  // Execute the provided expression in a new isolated world within the frame
  const isolatedWorldParams = {frameId: frame.id, grantUniveralAccess: true};
  return driver.sendCommand('Page.createIsolatedWorld', isolatedWorldParams)
    .then(id => driver._evaluateInContext(expression, id.executionContextId))
}

function collectConsentElements(extraSelectors) {
  const selectors = extraSelectors.concat([
    'button[name="agree"]', // Oath network
    'div[aria-modal=true] button svg', // Medium - selector combinators not supported
  ])

  const consentElements = selectors
    .map(s => { return [...document.querySelectorAll(s)] })
    // .filter(n => n) // filter out null elements
    .flat();

  let querySelected = consentElements.map(node => {
    // @ts-ignore - put into scope via stringification
    ((node.click && node.click()) ||
      node.parentElement && node.parentElement.click && node.parentElement.click())
    return {
      text: node.innerText || '',
      outerHTML: getOuterHTMLSnippet(node),
    }
  });

  const xpaths = [
    "//button[contains(., 'Accept')]", // nytimes.com
    "//button[contains(., 'ACCEPT')]", // mirror.co.uk
    "//button[contains(., 'I accept')]", // independent.co.uk
    "//button[contains(., 'OK')]", // theguardian.com
  ];

  let xpathSelected = xpaths.map(path => {
    const node = document.evaluate(path, document, null,
      XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (node) {
      ((node && node.click && node.click()) ||
        node && node.parentElement &&
          node.parentElement.click && node.parentElement.click())
      return {
        text: node.innerText || '',
        outerHTML: getOuterHTMLSnippet(node),
      }
    }
  })
  .filter(n => n)

  return querySelected.concat(xpathSelected);
}

/**
 * @fileoverview Extracts consent elements from the page
 */

class ControlConsentAccept extends Gatherer {
  /**
   * Function that is stringified and run in the page to collect consent elements.
   *
   * @return {LH.Artifacts['ControlConsentAccept']}
   */
  async afterPass(options) {
    const driver = options.driver;

    // Apply manually collected rules
    // console.log("Getting selectors for", options.baseArtifacts.URL.finalUrl);
    const consentSelectors = await loadConsentSelectors(options.baseArtifacts.URL.finalUrl)
      .catch(e => console.error("Error getting manual consent selectors", e));

    // Apply AdGuard-based domain-specific rules:
    const rules = await loadCookieRules(options.baseArtifacts.URL.finalUrl);
    rules.forEach(async r => {
      const expression = `(() => {
        ${r.script}
      })()`
      console.log("Evaluating", expression)
      await driver.evaluateAsync(expression, { useIsolation: false })
      .catch(e => {
        console.error("Got error when running script", e)
      })
    })

    return consentDom(driver)
      .then(async frames => {
        let selectors = chooseContentSelectors(options.baseArtifacts.URL.requestedUrl, consentSelectors)
          .map(s => [...Object.values(s.clicks)].flat().map(c => c.target))
          .flat()

        // Apply generic rules:
        const genericConsentExpression = `(() => {
          ${pageFunctions.getOuterHTMLSnippetString};
          ${pageFunctions.getElementsInDocumentString};
          return (${collectConsentElements})(${JSON.stringify(selectors)});
        })()`;

        return await Promise.all(frames.map(async frame => {
          let elements = await executeIn(driver, frame, genericConsentExpression);
          return {
            frame: frame.url,
            elements: JSON.stringify(elements)
          }
        }))
      })
  }
}

module.exports = ControlConsentAccept;
