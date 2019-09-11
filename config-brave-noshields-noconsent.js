'use strict';

const brave_config = require('./config-brave.js');

let passCategories = brave_config.categories;
passCategories.tracking.auditRefs = brave_config.categories.tracking.auditRefs.filter(a => a.id !== 'consent-audit')
module.exports = {

	passes: brave_config.passes
		.filter(pass => pass.passName === 'defaultPass')
		.map(pass => {
			pass.gatherers.unshift('control-brave-shieldsdown');
			return pass
		}),
	audits: brave_config.audits.filter(a => a !== 'consent-audit'),
	groups: brave_config.groups,
	categories: passCategories,
}
