/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
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

"use strict"; /*global describe, before, after, it*/

const request = require('superagent');

const superagentTest = require('../../test/legacy/superagent-test');
const hlp = require('../../test/legacy/helper');

superagentTest(request);

describe('The ACLs of the `Comment` API', function() {

	before(function(done) {
		hlp.setupUsers(request, {
			member: { roles: [ 'member' ], _plan: 'subscribed'}
		}, done);
	});

	after(function(done) {
		hlp.teardownUsers(request, done);
	});

	describe('for anonymous clients', function() {

		it('should deny access to release commenting', function(done) {
			request.post('/api/v1/releases/123456/comments').send({}).end(hlp.status(401, done));
		});

		it('should deny access to release moderation comment creation', function(done) {
			request.post('/api/v1/releases/123/moderate/comments').send({}).end(hlp.status(401, done));
		});

		it('should deny access to release moderation comment retrieval', function(done) {
			request.get('/api/v1/releases/123/moderate/comments').end(hlp.status(401, done));
		});

	});

	describe('for logged clients (role member)', function() {

		it('should allow access to release commenting', function(done) {
			request.post('/api/v1/releases/123456/comments').as('member').send({}).end(hlp.status(404, done));
		});

		it('should allow access to release moderation comment creation', function(done) {
			request.post('/api/v1/releases/123/moderate/comments').as('member').send({}).end(hlp.status(404, done));
		});

		it('should allow access to release moderation comment listing', function(done) {
			request.get('/api/v1/releases/123/moderate/comments').as('member').end(hlp.status(404, done));
		});

	});

});