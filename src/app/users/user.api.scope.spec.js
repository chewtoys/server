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
const expect = require('expect.js');

const superagentTest = require('../../test/legacy/superagent-test');
const hlp = require('../../test/legacy/helper');

superagentTest(request);

describe('The scopes of the `User` API', function() {

	let tokenAll, tokenLogin, tokenCommunity, tokenService;
	before(function() {

		return Promise.promisify(hlp.setupUsers.bind(hlp))(request, { root: { roles: [ 'root' ],  _plan: 'vip' } })
			.then(() => {
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'all-token', password: hlp.getUser('root').password, type: 'personal', scopes: ['all'] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenAll = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'login-token', password: hlp.getUser('root').password, type: 'personal', scopes: ['login'] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenLogin = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'community-token', password: hlp.getUser('root').password, type: 'personal', scopes: [ 'community' ] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenCommunity = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'service-token', password: hlp.getUser('root').password, provider: 'github', type: 'provider', scopes: [ 'service' ] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenService = res.body.token;
			});
	});

	after(function(done) {
		hlp.cleanup(request, done);
	});

	describe('using an "all" token', function() {

		it('should allow access to user list', done => {
			request.get('/api/v1/users').with(tokenAll).end(hlp.status(200, done));
		});
		it('should deny access to user creation through provider', done => {
			request.put('/api/v1/users').with(tokenAll).send({}).end(hlp.status(401, 'invalid scope', done));
		});
		it('should allow access to user details', done => {
			request.get('/api/v1/users/1234').with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to user update', done => {
			request.put('/api/v1/users/1234').send({}).with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to user deletion', done => {
			request.del('/api/v1/users/1234').with(tokenAll).end(hlp.status(403, done));
		});
	});

	describe('using a login token', function() {

		it('should deny access to user list', done => {
			request.get('/api/v1/users').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user creation through provider', done => {
			request.put('/api/v1/users').with(tokenLogin).send({}).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user details', done => {
			request.get('/api/v1/users/1234').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user update', done => {
			request.put('/api/v1/users/1234').send({}).with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user deletion', done => {
			request.del('/api/v1/users/1234').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
	});

	describe('using a community token', function() {

		it('should deny access to user list', done => {
			request.get('/api/v1/users').with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user creation through provider', done => {
			request.put('/api/v1/users').with(tokenCommunity).send({}).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user details', done => {
			request.get('/api/v1/users/1234').with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user update', done => {
			request.put('/api/v1/users/1234').send({}).with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user deletion', done => {
			request.del('/api/v1/users/1234').with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
	});

	describe('using a service token', function() {

		it('should deny access to user list', done => {
			request.get('/api/v1/users').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user details', done => {
			request.get('/api/v1/users/1234').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user update', done => {
			request.put('/api/v1/users/1234').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to user deletion', done => {
			request.del('/api/v1/users/1234').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should allow access to user creation through provider', done => {
			request.put('/api/v1/users').with(tokenService).send({}).end(hlp.status(422, done));
		});
	});
});