'use strict';

const Audit = require('lighthouse').Audit;

/**
 * @fileoverview Tests that `window.myLoadMetrics.searchableTime` was below the
 * test threshold value.
 */

class ConsentInteractionLog extends Audit {
  static get meta() {
    return {
      id: 'consent-interaction-log',
      title: 'Consent Interactions',
      failureTitle: 'Consent interactions recorded',
      description: 'Manual clicks on element user considered to be consent requests',

      // The name of the custom gatherer class that provides input to this audit.
      requiredArtifacts: ['ConsentInteractionGatherer'],
    };
  }

  static audit(artifacts) {
    const consentInteractions = artifacts.ConsentInteractionGatherer;

    return {
      score: 1,
      displayValue: "Consent interactions recorded",
      details: consentInteractions
    };
  }
}

module.exports = ConsentInteractionLog;
