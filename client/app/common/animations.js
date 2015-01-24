"use strict"; /* global _*/

angular.module('vpdb.animations', [])

	.animation('.height-animation', function($timeout) {
		return {
			enter: function(element, done) {

				// execute at the end of the stack so angular can finish rendering and we have the correct height
				$timeout(function() {
					var wrapper = element.parents('.ui-view-wrapper');
					var height = element.get(0).offsetHeight + 10;
					wrapper.css('height', height + 'px');
				});

				$timeout(function() {
					var wrapper = element.parents('.ui-view-wrapper').css('height', '');
					done();
				}, 300); // must be the same as the end of the css transformation
			},

			leave: function(element, done) {
				var wrapper = element.parents('.ui-view-wrapper');
				var height = element.get(0).offsetHeight + 10;
				wrapper.css('height', height + 'px');
				done();
			},
			move: function(element, done) { done(); },
			beforeAddClass : function(element, className, done) { done(); },
			addClass : function(element, className, done) { done(); },
			beforeRemoveClass : function(element, className, done) { done(); },
			removeClass : function(element, className, done) { done(); },
			allowCancel : function(element, event, className) {}
		};
	})

	/**
	 * new comment animation. slides in from the top.
	 */
	.animation('.collapse-in-animation', function($timeout) {
		var height;

		// before: collapse-in-animation ng-hide
		return {

			// classes: collapse-in-animation ng-hide ng-animate ng-hide-animate ng-hide-remove
			beforeRemoveClass: function(element, className, done) {

				// save height for later
				height = element.get(0).offsetHeight;

				// outer: measure, then set height to 0 (not animated)
				element.css('height', '0px');

				// inner: move out of outer (not animated)
				element.find('> .collapse-in-animation-inner').css('transform', 'translateY(-' + height + 'px)');
				done();
			},

			// classes: collapse-in-animation         ng-animate ng-hide-animate ng-hide-remove ng-hide-remove-active
			removeClass: function(element, className, done) {

				// outer: animate height to saved height
				element.css('height', height + 'px');

				// inner: animate to no transformation
				element.find('> .collapse-in-animation-inner').css('transform', '');

				// replace pixel height with auto (can't animate to auto)
				$timeout(function() {
					element.css('height', '');
				}, 350);

				done();
			}
			// afterwards: collapse-in-animation
		};
	});