"use strict";  /* global browser */

var util = require('util');

var AbstractPage = require('./abstract');

function GameDetailsPage() {
	AbstractPage.call(this);
	this.path = '/games/';
}

util.inherits(GameDetailsPage, AbstractPage);

module.exports = GameDetailsPage;
