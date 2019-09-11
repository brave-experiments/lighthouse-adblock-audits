'use strict';

const Audit = require('lighthouse').Audit;

/**
 * @fileoverview Tests that `window.myLoadMetrics.searchableTime` was below the
 * test threshold value.
 */

class AdblockAnalysisAudit extends Audit {
  static get meta() {
    return {
      id: 'adblock-audit',
      title: 'Network requests reported as blocked by adblock-rust library',
      failureTitle: 'Resources blocked',
      description: 'Were any resources deemed as blocked',

      // The name of the custom gatherer class that provides input to this audit.
      requiredArtifacts: ['AdblockAnalysis'],
    };
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static audit(artifacts) {
    const blockedRequests = artifacts.AdblockAnalysis.blocked;

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'url', itemType: 'url', text: 'URL'},
      {key: 'startTime', itemType: 'ms', granularity: 1, text: 'Start Time'},
      {key: 'endTime', itemType: 'ms', granularity: 1, text: 'End Time'},
      {
        key: 'transferSize',
        itemType: 'bytes',
        displayUnit: 'kb',
        granularity: 1,
        text: 'Transfer Size', // TODO(exterkamp): i18n this when i18n'ing this file
      },
      {key: 'resourceType', itemType: 'text', text: 'Resource Type'},
      {key: 'blocked', itemType: 'text', text: 'Resource Blocked'},
      {key: 'initiatorBlocked', itemType: 'text', text: 'Resource Not Discovered'},
    ];

    const summary = {
      blockedRequests: blockedRequests.length,
      blockedBytes: blockedRequests.reduce((sum,req) => sum += req.transferSize, 0)
    }

    return {
      score: (blockedRequests.length - blockedRequests.length) / blockedRequests.length * 100,
      numericValue: blockedRequests.length,
      displayValue: `${summary.blockedRequests} - ${(summary.blockedBytes/1024).toFixed(3)}kb resources blocked`,
      details: Audit.makeTableDetails(headings, blockedRequests, summary),
    };

  }
}

module.exports = AdblockAnalysisAudit;
