/*\
title: $:/plugins/BTC/resizer/modules/utils/feature-adapters.js
type: application/javascript
module-type: library

Extracted compatibility module for the BTC resizer widget.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var ResizerSnap = require("$:/plugins/BTC/resizer/modules/utils/snap.js");
var ResizerPresets = require("$:/plugins/BTC/resizer/modules/utils/presets.js");
var ResizerCSSVariable = require("$:/plugins/BTC/resizer/modules/utils/css-variable.js");

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.applySnapToPixelValue = function(pixelValue, contextSize, handleSize, element) {
	return ResizerSnap.applySnapToPixelValue(this, pixelValue, contextSize, handleSize, element);
};

ResizerWidget.prototype.publishCSSVariable = function(value, element, variableName) {
	return ResizerCSSVariable.publish(this, value, element, variableName);
};

ResizerWidget.prototype.applyNextPreset = function(domNode) {
	return ResizerPresets.applyNextPreset(this, domNode);
};

};
