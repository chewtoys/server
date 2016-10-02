/*
 * VPDB - Visual Pinball Database
 * Copyright (C) 2016 freezy <freezy@xbmc.org>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

"use strict";
Promise = require('bluebird'); // jshint ignore:line

const _ = require('lodash');
const url = require('url');
const fs = require('fs');
const exec = require('child_process').execFile;
const axios = require('axios');
const config = require('../modules/settings').current;

let sha, cmd;
Promise.try(() => {

	if (!config.primary) {
		throw Error('Host must have a primary config in order to reset to production.');
	}

	if (!process.getuid || process.getuid() !== 0) {
		throw Error('Must be run with root privileges, otherwise I cannot stop the services.');
	}

	if (_.isEqual(config.vpdb.api, config.primary.api)) {
		throw Error('Primary cannot be the same host!');
	}

	// if (!fs.existsSync(config.primary.mongoReadOnly.dataPath)) {
	// 	throw Error('Data folder "' + config.primary.mongoReadOnly.dataPath + '" for replicated read-only instance does not exist.');
	// }
	// if (!fs.existsSync(config.primary.mongoReadWrite.dataPath)) {
	// 	throw Error('Data folder "' + config.primary.mongoReadWrite.dataPath + '" for read-write instance does not exist.');
	// }

	console.log('Retrieving build number at %s...', config.primary.api.hostname);

	// retrieve primary version
	const p = config.primary.api;
	return axios({ method: 'get', url: `${p.protocol}://${p.hostname}:${p.port}${p.pathname}/` });

}).then(function(response) {

	sha = response.data.app_sha;
	console.log('Primary "%s" at %s is up and running build %s.', response.data.app_name, config.primary.api.hostname, sha);

	// TODO checkout given SHA1

	console.log('Stopping MongoDB instances...');

	cmd = 'systemctl stop ' + config.primary.mongoReadWrite.service;
	console.log('> %s', cmd);
	return execAsync(cmd);

}).then(() => {
	cmd = 'systemctl stop ' + config.primary.mongoReadOnly.service;
	return execAsync(cmd);

}).then(() => {
	console.log('Deleting old data...');
	cmd = 'rm -rf ' + config.primary.mongoReadWrite.dataPath;
	return execAsync(cmd);

}).then(() => {
	console.log('Copying replication data...');
	cmd = 'cp -a ' + config.primary.mongoReadOnly.dataPath + ' ' + config.primary.mongoReadWrite.dataPath;
	return execAsync(cmd);

}).then(() => {
	console.log('Starting MongoDB instances...');
	cmd = 'systemctl start ' + config.primary.mongoReadOnly.service;
	return execAsync(cmd);

}).then(() => {
	cmd = 'systemctl start ' + config.primary.mongoReadWrite.service;
	return execAsync(cmd);

}).then(() => {

	const dbConfig = url.parse(config.vpdb.db);
	const dbName = dbConfig.path.substring(1);
	if (config.primary.mongoReadOnly.dbName !== dbName) {
		cmd = 'mongo --host ' + dbConfig.host;
		if (dbConfig.port) {
			cmd += ' --port ' + dbConfig.port;
		}
		if (dbConfig.auth) {
			const a = dbConfig.auth.split(':');
			cmd += ' -u ' + a[0] + ' -p ' + a[1];
		}
		cmd += ' --eval \'db.copyDatabase("' + config.primary.mongoReadOnly.dbName + '", "' + dbName + '");use ' + config.primary.mongoReadOnly.dbName + ';db.dropDatabase();\'';
		return execAsync(cmd);
	}

}).then(() => {
	console.log('All done!');

}).catch(err => {
	console.error('ERROR: ', err);
});

function execAsync(cmd) {
	console.log('--> %s', cmd);

	let child = exec(cmd);
	child.stdout.on('data', function (data) {
		console.log('--- ' + data);
	});
	child.stderr.on('data', function (data) {
		console.log('--- ' + data);
	});
	return new Promise(function (resolve, reject) {
		child.addListener('error', reject);
		child.addListener('exit', (code, signal) => {
			if (code === 0) {
				resolve();
			} else {
				reject();
		}});
	});
}
