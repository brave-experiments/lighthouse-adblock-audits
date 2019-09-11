'use strict';

const fs = require('fs');
const AdBlockClient = require('adblock-rs');
const URL = require('./node_modules/lighthouse/lighthouse-core/lib/url-shim.js');
const Gatherer = require('lighthouse').Gatherer;

function getAdblock() {
  let rules = []
  rules = rules.concat(fs.readFileSync('./blocklists/easylist.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/easyprivacy.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/filters.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/unbreak.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/brave-unbreak.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/brave-disconnect.txt', { encoding: 'utf-8' }).split('\n'))
  rules = rules.concat(fs.readFileSync('./blocklists/coin-miners.txt', { encoding: 'utf-8' }).split('\n'))

  const client = new AdBlockClient.Engine(rules, true);

  return client
}

function initiator_urls(initiatorStack, allurls = []) {
  if (initiatorStack.callFrames) {
    let urls = initiatorStack.callFrames
      .map(f => f.url)

    allurls = urls
      .reduce((unique, item) => {
        return (unique.length !== 0 && unique[unique.length - 1] === item) ? unique : [...unique, item]
      }, allurls)
  }
  if (initiatorStack && initiatorStack.parent) {
    allurls = initiator_urls(initiatorStack.parent, allurls)
  }

  return allurls
}

/**
 * @fileoverview Tests that `window.myLoadMetrics.searchableTime` was below the
 * test threshold value.
 */

class AdblockAnalysis extends Gatherer {
  get name() {
    return 'AdblockAnalysis';
  }

  /**
   * @param {Array<LH.WebInspector.NetworkRequest>} records
   * @return {LH.Artifacts.AdblockAnalysis}
   */
  static computeBlocking(records) {
    let adblock = getAdblock();

    const earliestStartTime = records.reduce(
      (min, record) => Math.min(min, record.startTime),
      Infinity
    );

    /** @param {number} time */
    const timeToMs = time => time < earliestStartTime || !Number.isFinite(time) ?
      undefined : (time - earliestStartTime) * 1000;



    let urlsBlocked = new Set();
    const blockedRecords = records.map(record => {

      let initiatorBlocked = false
      if (record.initiator && record.initiator.stack) {
        let initiators = initiator_urls(record.initiator.stack)
        initiatorBlocked = initiators.some(p => urlsBlocked.has(p))
      }

      let blocked = false
      if (!initiatorBlocked) {
        blocked = adblock.check(record.url, record.documentURL, record.resourceType || 'other')
      }
      if (initiatorBlocked || blocked) {
        urlsBlocked.add(record.url)
      }

      const endTimeDeltaMs = record.lrStatistics && record.lrStatistics.endTimeDeltaMs;
      const TCPMs = record.lrStatistics && record.lrStatistics.TCPMs;
      const requestMs = record.lrStatistics && record.lrStatistics.requestMs;
      const responseMs = record.lrStatistics && record.lrStatistics.responseMs;

      return {
        url: URL.elideDataURI(record.url),
        startTime: timeToMs(record.startTime),
        endTime: timeToMs(record.endTime),
        transferSize: record.transferSize,
        resourceSize: record.resourceSize,
        statusCode: record.statusCode,
        mimeType: record.mimeType,
        resourceType: record.resourceType,
        initiatorBlocked: initiatorBlocked,
        blocked: blocked,
      };
    })
    .filter(r => r.blocked || r.initiatorBlocked);

    return {
      blocked: blockedRecords
    }
  }

  /**
   * @param {LH.DevtoolsLog} devtoolsLog
   * @param {LH.ComputedArtifacts} computedArtifacts
   * @return {Promise<LH.Artifacts.NetworkAnalysis>}
   */
  async afterPass(passContext, loadData) {
    const driver = passContext.driver;
    const blockedRequests = AdblockAnalysis.computeBlocking(loadData.networkRecords);
    return blockedRequests;
  }
}

module.exports = AdblockAnalysis;
