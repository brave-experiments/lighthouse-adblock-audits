'use strict';

const Audit = require('lighthouse').Audit;

/**
 * @fileoverview Tests that `window.myLoadMetrics.searchableTime` was below the
 * test threshold value.
 */

class ConsentAudit extends Audit {
  static get meta() {
    return {
      id: 'consent-audit',
      title: 'User consent element not presented',
      failureTitle: 'Consent element detected',
      description: 'Did we automatically find any consent elements to agree to?',

      // The name of the custom gatherer class that provides input to this audit.
      requiredArtifacts: ['ControlConsentAccept'],
    };
  }

  static audit(artifacts) {
    const consentElements = artifacts.ControlConsentAccept;

    const aboveThreshold = consentElements.some(c => c.elements.length >= 1);

    const headings = [
      {key: 'frame', itemType: 'url', text: 'Frame URL'},
      {key: 'elements', itemType: 'text', text: 'Consent Elements'},
    ];

    const tableDetails = Audit.makeTableDetails(headings, consentElements);

    return {
      numericValue: consentElements.reduce((sum, consent) => sum + consent.elements.length, 0),
      // Cast true/false to 1/0
      scoreDisplayMode: "binary",
      score: aboveThreshold ? 0 : 1,
      displayValue: `Some actionable elements found`,
      details: tableDetails
    };
  }
}

module.exports = ConsentAudit;
