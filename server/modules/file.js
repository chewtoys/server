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

'use strict';

var fs = require('fs');
var logger = require('winston');
var Bluebird = require('bluebird');
var File = require('mongoose').model('File');
var storage = require('./storage');

/**
 * Creates a new file
 * @param {object} fileData Model data
 * @param {stream} readStream Binary stream of file content
 * @param {function} error Error logger
 * @param {function} [callback] Callback, executed with err and file.
 * @return {Promise}
 */
exports.create = function(fileData, readStream, error, callback) {

	var file;
	return Bluebird.resolve().then(function() {
		file = new File(fileData);
		return file.validate();

	}).then(function() {
		return file.save();

	}).then(function(f) {
		file = f;
		return new Bluebird(function(resolve, reject) {
			var writeStream = fs.createWriteStream(file.getPath());
			writeStream.on("finish", resolve);
			writeStream.on("error", reject);
			readStream.pipe(writeStream);
		});

	}).then(function() {
		return storage.preprocess(file);

	}).then(function() {
		return storage.metadata(file).catch(err => {

			// fail and remove file if metadata failed
			return file.remove().catch(err => {
				logger.error('[api|file:save] Error removing file: %s', err.message);

			}).then(function() {
				throw error(err, 'Metadata parsing failed for type "%s"', file.mime_type).short().warn().status(400);
			});
		});

	}).then(function(metadata) {

		File.sanitizeObject(metadata);
		file.metadata = metadata;
		return file.save();

	}).then(function(file) {

		logger.info('[api|file:save] File upload of %s successfully completed.', file.toString());

		// do this in the background.
		storage.postprocess(file);
		return file;

	}).nodeify(callback);
};