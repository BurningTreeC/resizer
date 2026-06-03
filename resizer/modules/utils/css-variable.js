/*\
title: $:/plugins/BTC/resizer/modules/utils/css-variable.js
type: application/javascript
module-type: library

Optional CSS variable publishing for BTC resizer widgets.
\*/

/*jslint node: true, browser: true */
"use strict";

var resolveTargetElements = function(widget, element) {
	var mode = widget.cssVariableTarget || "target";
	var selector = widget.cssVariableSelector;
	var doc = widget.document;

	if(mode === "root") {
		return [doc.documentElement];
	}
	if(mode === "parent") {
		return element && element.parentElement ? [element.parentElement] : [];
	}
	if(mode === "selector" && selector) {
		return Array.prototype.slice.call(doc.querySelectorAll(selector));
	}
	if(mode && mode.charAt(0) === "." || mode && mode.charAt(0) === "#" || mode && mode.charAt(0) === "[") {
		return Array.prototype.slice.call(doc.querySelectorAll(mode));
	}
	return element ? [element] : [];
};

exports.publish = function(widget, value, element, variableName) {
	var name = variableName || widget.cssVariable;
	var targets, i;

	if(!name || !value) {
		return false;
	}
	if(name.indexOf("--") !== 0) {
		name = "--" + name;
	}

	targets = resolveTargetElements(widget, element);
	for(i = 0; i < targets.length; i++) {
		if(targets[i] && targets[i].style) {
			targets[i].style.setProperty(name, value);
		}
	}
	return targets.length > 0;
};
