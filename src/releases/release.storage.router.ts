/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2018 freezy <freezy@vpdb.io>
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

import { Scope } from '../common/scope';
import { ReleaseStorage } from './release.storage';

const storage = new ReleaseStorage();
export const router = storage.storageRouter(true);

router.get('/v1/releases/:release_id',        storage.auth(storage.download.bind(storage), 'files', 'download', [ Scope.ALL ]));
router.head('/v1/releases/:release_id',       storage.auth(storage.checkDownload.bind(storage), 'files', 'download', [ Scope.ALL ]));
router.post('/v1/releases/:release_id',       storage.auth(storage.download.bind(storage), 'files', 'download', [ Scope.ALL ]));
router.get('/v1/releases/:release_id/thumb', storage.thumbRedirect.bind(storage));