'use strict';

const Gatherer = require('lighthouse').Gatherer;
const URL = require('url').URL;

class ControlBraveShieldsUp extends Gatherer {
  get name() {
    return 'ControlBraveShieldsUp';
  }

  static async enableAdblock(passContext) {
    // console.error("Pass context", passContext)
    const driver = passContext.driver;
    const url = new URL(passContext.baseArtifacts.URL.finalUrl);

    let result = await driver.sendCommand("Target.getTargets", {})
    .then(targets => {
      // Find "Brave" target by title
      return targets.targetInfos.find(t => t.title === 'Brave')
    })
    .then(braveTarget => {
      // Attach to the target and get sessionId
      return driver.sendCommand("Target.activateTarget", {targetId: braveTarget.targetId})
        .then(() => driver.sendCommand("Target.attachToTarget", {targetId: braveTarget.targetId, flatten: false}))
    })
    .then(sessionId => {
      // Shields are controlled through chrome "Content Settings", as a plugin
      // "block", opposite to the meaning of most content settings means "block shields",
      // i.e. disable shields
      // let code = `chrome.braveShields.setBraveShieldsEnabled(false, "${url.origin}/*");`;
      let code = `chrome.contentSettings.plugins.set({primaryPattern: "*://*/*", resourceIdentifier: {id: "braveShields"}, setting: 'allow', scope: 'regular'})`;

      // console.log("Execute", code)

      const evaluationParams = {
        expression: code,
        includeCommandLineAPI: true,
        awaitPromise: false,
        returnByValue: true,
        timeout: 500,
        contextId: undefined,
      };

      // Need to send the message to the specific target:
      // otherwise goes to the default target with no access to
      // `braveShields` API
      return driver.sendMessageToTarget([sessionId.sessionId],
        'Runtime.evaluate', evaluationParams);
    })
    .catch(err => {
      console.error("Error while evaluating:", err);
      passContext.adblockEnabled = false;
    })
    passContext.adblockEnabled = true;
  }

  async afterPass(passContext) {
    ControlBraveShieldsUp.enableAdblock(passContext);
    return {
      adblockEnabled: passContext.adblockEnabled
    }
  }
}

module.exports = ControlBraveShieldsUp;
