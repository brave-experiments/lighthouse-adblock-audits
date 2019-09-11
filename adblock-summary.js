'use strict';

const thirdPartyWeb = require('third-party-web/httparchive-nostats-subset');

const Audit = require('lighthouse').Audit;
const NetworkRecords = require('lighthouse').NetworkRecords;
const BootupTime = require('./node_modules/lighthouse/lighthouse-core/audits/bootup-time.js');
const MainThreadTasks = require('./node_modules/lighthouse/lighthouse-core/computed/main-thread-tasks.js');
const URL = require('url').URL;

class AdblockSummary extends Audit {
  /**
   * @return {LH.Audit.Meta}
   */
  static get meta() {
    return {
      id: 'adblock-summary',
      title: "Adblocked resource usage",
      description: 'Adblocked resources can significantly impact load performance when adblocker is not in use. ' +
        'Limit the number of resources that get blocked for many users and try to load third-party code after ' +
        'your page has primarily finished loading',
      scoreDisplayMode: Audit.SCORING_MODES.INFORMATIVE,
      requiredArtifacts: ['traces', 'AdblockAnalysis'],
    };
  }

  /**
   * `third-party-web` throws when the passed in string doesn't appear to have any domain whatsoever.
   * We pass in some not-so-url-like things, so make the dependent-code simpler by making this call safe.
   * @param {string} url
   * @return {ThirdPartyEntity|undefined}
   */
  static getEntitySafe(url) {
    try {
      const entity = thirdPartyWeb.getEntity(url);
      if (entity) {
        return entity;
      } else {
        return (new URL(url)).hostname
      }
    } catch (_) {
      return undefined
    }
  }


  /**
   *
   * @param {Array<LH.Artifacts.NetworkRequest>} networkRecords
   * @param {Array<LH.Artifacts.TaskNode>} mainThreadTasks
   * @param {number} cpuMultiplier
   * @return {Map<ThirdPartyEntity, {mainThreadTime: number, transferSize: number}>}
   */
  static getSummaryByEntity(networkRecords, mainThreadTasks, cpuMultiplier) {
    const bootupTimeAttribution = new Map();
    const jsURLs = BootupTime.getJavaScriptURLs(networkRecords);
    for (const task of mainThreadTasks) {
      const attributeableURL = BootupTime.getAttributableURLForTask(task, jsURLs);
      const bootupTimeStats = bootupTimeAttribution.get(attributeableURL) || {mainThreadTime: 0};
      bootupTimeStats.mainThreadTime += task.selfTime * cpuMultiplier;
      bootupTimeAttribution.set(attributeableURL, bootupTimeStats);
    }

    /** @type {Map<ThirdPartyEntity, {mainThreadTime: number, transferSize: number}>} */
    const entities = new Map();

    for (const request of networkRecords) {
      const entity = AdblockSummary.getEntitySafe(request.url);
      if (!entity) continue;

      const entityStats = entities.get(entity) || {mainThreadTime: 0, transferSize: 0};
      entityStats.transferSize += request.transferSize;
      const bootupTimeStats = bootupTimeAttribution.get(request.url) || {mainThreadTime: 0};
      entityStats.mainThreadTime += bootupTimeStats.mainThreadTime;
      entities.set(entity, entityStats);
    }

    return entities;
  }

  /**
   * @param {LH.Artifacts} artifacts
   * @param {LH.Audit.Context} context
   * @return {Promise<LH.Audit.Product>}
   */
  static async audit(artifacts, context) {
    const settings = context.settings || {};
    const trace = artifacts.traces[Audit.DEFAULT_PASS];
    const networkRecords = artifacts.AdblockAnalysis.blocked;
    const tasks = await MainThreadTasks.request(trace, context);
    const multiplier = settings.throttlingMethod === 'simulate' ?
      settings.throttling.cpuSlowdownMultiplier : 1;

    const summaryByEntity = AdblockSummary.getSummaryByEntity(networkRecords, tasks, multiplier);

    const summary = {wastedBytes: 0, wastedMs: 0};

    // Sort by a combined measure of bytes + main thread time.
    // 1KB ~= 1 ms
    /** @param {{transferSize: number, mainThreadTime: number}} stats */
    const computeSortValue = stats => stats.transferSize / 1024 + stats.mainThreadTime;

    const results = Array.from(summaryByEntity.entries())
      .map(([entity, stats]) => {
        summary.wastedBytes += stats.transferSize;
        summary.wastedMs += stats.mainThreadTime;

        return {
          entity: /** @type {LH.Audit.Details.LinkValue} */ ({
            type: 'link',
            text: entity.name || entity,
            url: entity.homepage || entity || '',
          }),
          transferSize: stats.transferSize,
          mainThreadTime: stats.mainThreadTime,
        };
      })
      .sort((a, b) => computeSortValue(b) - computeSortValue(a));

    /** @type {LH.Audit.Details.Table['headings']} */
    const headings = [
      {key: 'entity', itemType: 'link', text: 'Blocked Party'},
      {key: 'transferSize', granularity: 1, itemType: 'bytes', text: 'Size'},
      {key: 'mainThreadTime', granularity: 1, itemType: 'ms', text: 'Main Thread Time'},
    ];

    if (!results.length) {
      return {
        score: 1,
        notApplicable: true,
      };
    }

    return {
      score: Number(results.length === 0),
      displayValue: `${results.length} Blocked Parties Found`,
      details: Audit.makeTableDetails(headings, results, summary),
    };
  }
}

module.exports = AdblockSummary;
