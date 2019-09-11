'use strict';

const Gatherer = require('lighthouse').Gatherer;
const pageFunctions = require('./lib/page-functions.js');
const fs = require('fs');
const URL = require('url').URL;

function logClick(e) {
  function elementSelector(el) {
    return el.localName
      + [...el.classList].map(c => "." + c).join('')
      + [el.id].map(i => {
        if (i) { return "#" + i } else { return "" }
      })
  }

  let click = {
    url: document.location.href,
    x: e.x,
    y: e.y,
    target: elementSelector(e.target),
    srcElement: elementSelector(e.srcElement),
    path: [...e.path].reverse().splice(3).map(elementSelector)
  }
  console.log("Caught click", click);

  let clicks_str = localStorage.getItem("lh_clicks");
  let clicks;
  if (clicks_str) {
    clicks = JSON.parse(clicks_str);
  } else {
    clicks = [];
  }
  clicks.push(click);

  window.localStorage.setItem("lh_clicks", JSON.stringify(clicks));
}

async function attachedToTarget(driver, event) {

  await driver.sendMessageToTarget([event.sessionId], 'Target.setAutoAttach', {
    autoAttach: true,
    // Pause targets on startup so we don't miss anything
    waitForDebuggerOnStart: true,
  });

  const evaluationParams = {
    expression: `(() => {
        document.addEventListener("click", ${logClick.toString()});
      })()`,
    includeCommandLineAPI: true,
    awaitPromise: false,
    returnByValue: true,
    timeout: 500,
    contextId: undefined,
  };

  await driver.sendMessageToTarget([event.sessionId], 'DOMStorage.enable')

  driver.sendMessageToTarget([event.sessionId], 'Runtime.evaluate', evaluationParams);
}

class ConsentInteractionGatherer extends Gatherer {
  constructor() {
    super();
    this._clicks = {};
    this._onDomStorageEntry = this.onDomStorageEntry.bind(this);
  }
  /**
   * @param {LH.Crdp.Log.EntryAddedEvent} entry
   */
  onDomStorageEntry(entry) {
    if (entry.key === 'lh_clicks') {
      this._clicks[entry.storageId.securityOrigin] = JSON.parse(entry.newValue);
    }
  }

  async beforePass(options) {
    const driver = options.driver;

    driver.on('DOMStorage.domStorageItemAdded', this._onDomStorageEntry);
    driver.on('DOMStorage.domStorageItemUpdated', this._onDomStorageEntry);
    await driver.sendCommand('DOMStorage.enable');

    driver.evaluateScriptOnNewDocument(`(() => {
        document.addEventListener("click", ${logClick.toString()});
      })()`);

    driver.on('Target.receivedMessageFromTarget', event => {
      const {targetId, sessionId, message} = event;
      /*
       * @type {LH.Protocol.RawMessage}
       */
      const protocolMessage = JSON.parse(message);

      // Message was a response to some command, not an event, so we'll ignore it.
      if ('id' in protocolMessage) return;

      // We receive messages from the outermost subtarget which wraps the messages from the inner subtargets.
      // We are recursively processing them from outside in, so build the list of parentSessionIds accordingly.
      const sessionIdPath = [sessionId];

      if (protocolMessage.method === 'Target.attachedToTarget') {
        // Process any attachedToTarget messages from subtargets
        attachedToTarget(driver, event);
      }
      if (protocolMessage.method.startsWith('DOMStorage.domStorageItem')) {
        this.onDomStorageEntry(protocolMessage.params)
      }
    });

    driver.on('Target.attachedToTarget', event => attachedToTarget(driver, event));
  }
  /**
   * Function that is stringified and run in the page to collect consent elements.
   *
   * @return {LH.Artifacts['ConsentInteractionGatherer']}
   */
  async afterPass(options) {
    const driver = options.driver;
    console.log("Got clicks", JSON.stringify(this._clicks));
    driver.off('DOMStorage.domStorageItemAdded', this._onDomStorageEntry);
    driver.off('DOMStorage.domStorageItemUpdated', this._onDomStorageEntry);
    driver.sendCommand('DOMStorage.disable');
    return this._clicks
  }
}

module.exports = ConsentInteractionGatherer;
