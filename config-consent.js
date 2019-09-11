'use strict';

module.exports = {

  // 1. Add consent to the first pass of the page before measuring anything
  passes: [
  {
    passName: 'consentAccept',
    recordTrace: false,
    useThrottling: false,
    pauseAfterLoadMs: 10 * 1000, // wait for 5 seconds for any consent form to appear
    gatherers: [
      'control-brave-shieldsdown',
      'consent-interaction-gatherer',
    ],
  },
  ],

  // 2. Add audits of interest from the full list of 'lighthouse:default'
  audits: [
    'consent-interaction-log',
  ],

  // 3. Createcategories for the audits
  categories: {
    'tracking': {
      title: 'User consent interactions',
      description: 'Manual suer interactions with tracking/cookie/gdpr consent requests',
      auditRefs: [
        {id: 'consent-interaction-log', weight: 0},
      ],
    },
  },
};
