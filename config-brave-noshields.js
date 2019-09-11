'use strict';

const brave_config = require('./config-brave.js');

module.exports = {

	passes: brave_config.passes.map(pass => {
	  if (pass.passName === 'consentAccept') {
	    pass.gatherers =  [
	      'control-brave-shieldsdown',
	      'control-consent-accept',
	    ]
	  }
	  return pass
	}),
	audits: brave_config.audits,
	groups: brave_config.groups,
	categories: brave_config.categories,
}
