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

import { extend } from 'lodash';
import { Schema } from 'mongoose';

import { state } from '../state';
import { Api } from '../common/api';
import { acl } from '../common/acl';
import { Context } from '../common/types/context';
import { logger } from '../common/logger';
import { ApiError } from '../common/api.error';

export class TagApi extends Api {

	/**
	 * Lists all tags.
	 *
	 * @see GET /v1/tags
	 * @param {Context} ctx Koa context
	 */
	public async list(ctx: Context) {
		let query: any;
		if (ctx.state.user) {
			// logged users also get their own tags even if inactive.
			query = { $or: [{ is_active: true }, { _created_by: ctx.state.user._id }] };
		} else {
			query = { is_active: true };
		}
		let tags = await state.models.Tag.find(query).exec();

		// reduce
		tags = tags.map(tag => state.serializers.Tag.simple(ctx, tag));
		return this.success(ctx, tags);
	}

	/**
	 * Creates a new tag.
	 *
	 * @see POST /v1/tags
	 * @param {Context} ctx Koa context
	 */
	public async create(ctx: Context) {
		const newTag = new state.models.Tag(extend(ctx.body, {
			_id: ctx.body.name ? ctx.body.name.replace(/(^[^a-z0-9]+)|([^a-z0-9]+$)/gi, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() : '-',
			is_active: false,
			created_at: new Date(),
			_created_by: ctx.state.user._id
		}));
		await newTag.save();
		logger.info('[TagApi.create] Tag "%s" successfully created.', newTag.name);
		return this.success(ctx, state.serializers.Tag.simple(ctx, newTag), 201);
	}

	/**
	 * Deletes a tag.
	 *
	 * @see DELETE /v1/tags/:id
	 * @param {Context} ctx Koa context
	 */
	public async del(ctx: Context) {

		let canDelete: boolean;
		const canGloballyDelete = await acl.isAllowed(ctx.state.user.id, 'tags', 'delete');
		if (!canGloballyDelete) {
			canDelete = await acl.isAllowed(ctx.state.user.id, 'tags', 'delete-own');
		} else {
			canDelete = true;
		}
		if (!canDelete) {
			throw new ApiError('You cannot delete tags.').status(401).log();
		}
		const tag = await state.models.Tag.findById(ctx.params.id).exec();
		// tag must exist
		if (!tag) {
			throw new ApiError('No such tag with ID "%s".', ctx.params.id).status(404);
		}

		// only allow deleting own tags
		if (!canGloballyDelete && (!tag._created_by || !(tag._created_by as Schema.Types.ObjectId).equals(ctx.state.user._id))) {
			throw new ApiError('Permission denied, must be owner.').status(403).log();
		}
		// todo check if there are references
		await tag.remove();

		logger.info('[api|tag:delete] Tag "%s" (%s) successfully deleted.', tag.name, tag._id);
		return this.success(ctx, null, 204);
	}
}