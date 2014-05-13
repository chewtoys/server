var _ = require('underscore');
var util = require('util');
var logger = require('winston');
var request = require('request');
var mongoose = require('mongoose');
var LocalStrategy = require('passport-local').Strategy;
var GitHubStrategy = require('passport-github').Strategy;
var IPBoardStrategy = require('./modules/passport-ipboard').Strategy;

var settings = require('./modules/settings');
var User = mongoose.model('User');

/**
 * Defines the authentication strategies and user serialization.
 *
 * @param passport Passport module
 * @param config Passport configuration from settings
 */
module.exports = function(passport, config) {

	// serialize sessions
	passport.serializeUser(function(user, done) {
		done(null, user.id);
	});

	passport.deserializeUser(function(id, done) {
		User.findOne({ _id: id }, function(err, user) {
			done(err, user);
		})
	});

	// oauth callback
	var updateProfile = function(strategy, providerName) {
		var provider = providerName ? providerName : strategy;
		return function(accessToken, refreshToken, profile, done) {
			profile.id = profile.id.toString(); // types must be equal when matching in mongodb
			var providerMatch = {};
			providerMatch[provider + '.id'] = profile.id;
			User.findOne().or([providerMatch, {'email': profile.emails[0].value }]).exec(function(err, user) {
				var logtag = providerName ? strategy + ':' + providerName : strategy;
				if (!user) {
					logger.info('[passport|%s] Saving new user %s <%s>', logtag, profile.username, profile.emails[0].value);

					// mandatory data
					user = new User({
						name: profile.displayName,
						email: profile.emails[0].value,
						provider: provider
					});

					// save original data to separate field
					user[provider] = profile._json;
					user[provider].id = profile._json.id.toString();

					// optional data
					if (profile.photos && profile.photos.length > 0) {
						user.thumb = profile.photos[0].value;
					}

					// now save and return
					user.save(function(err) {
						if (err) {
							logger.error('[passport|%s] Error creating user: %s', logtag, err);
						}
						return done(err, user);
					});
				} else {
					if (!user[provider]) {
						logger.info('[passport|%s] Adding profile from %s to user.', logtag, provider, profile.emails[0].value);
					} else {
						logger.info('[passport|%s] Returning user %s', logtag, profile.emails[0].value);
					}

					// update profile data on separate field
					user[provider] = profile._json;
					user[provider].id = profile._json.id.toString();

					// optional data
					if (!user.thumb && profile.photos && profile.photos.length > 0) {
						user.thumb = profile.photos[0].value;
					}

					// save and return
					user.save(function(err) {
						if (err) {
							logger.error('[passport|%s] Error updating user: %s', logtag, err);
						}
						return done(err, user);
					});
				}
			});
		};
	};

	// use github strategy
	if (config.vpdb.passport.github.enabled) {
		logger.info('[passport] Enabling GitHub authentication strategy.');
		passport.use(new GitHubStrategy({
				clientID: config.vpdb.passport.github.clientID,
				clientSecret: config.vpdb.passport.github.clientSecret,
				callbackURL: settings.publicUrl(config) + '/auth/github/callback'
			}, updateProfile('github'))
		);
	}

	// ipboard strategies
	_.each(config.vpdb.passport.ipboard, function(ipbConfig) {
		if (ipbConfig.enabled) {

			var callbackUrl = settings.publicUrl(config) + '/auth/' +  ipbConfig.id + '/callback';
			logger.info('[passport|ipboard:' + ipbConfig.id + '] Enabling IP.Board authentication strategy for "%s" with callback %s.', ipbConfig.name, callbackUrl);
			passport.use(new IPBoardStrategy({
					name: ipbConfig.id,
					baseURL: ipbConfig.baseURL,
					clientID: ipbConfig.clientID,
					clientSecret: ipbConfig.clientSecret,
					callbackURL: callbackUrl
				}, updateProfile('ipboard', ipbConfig.id))
			);
		}
	});

	// use local strategy
	passport.use(new LocalStrategy({
			usernameField: 'email',
			passwordField: 'password'
		},
		function(email, password, done) {
			User.findOne({ email: email }, function(err, user) {
				if (err) {
					return done(err);
				}
				if (!user) {
					return done(null, false, { message: 'Unknown user' });
				}
				if (!user.authenticate(password)) {
					return done(null, false, { message: 'Invalid password' });
				}
				return done(null, user);
			});
		}
	));


};
