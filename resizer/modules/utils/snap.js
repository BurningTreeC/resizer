/*\
title: $:/plugins/BTC/resizer/modules/utils/snap.js
type: application/javascript
module-type: library

Optional snap-point support for BTC resizer widgets.
\*/

/*jslint node: true, browser: true */
"use strict";

exports.parseSnapValues = function(widget) {
	var raw = widget.snap || "";
	var values = [];
	var token = "";
	var depth = 0;
	var i, ch;

	for(i = 0; i < raw.length; i++) {
		ch = raw.charAt(i);
		if(ch === "(") {
			depth++;
			token += ch;
		} else if(ch === ")") {
			depth--;
			token += ch;
		} else if((ch === " " || ch === "," || ch === ";" || ch === "|") && depth === 0) {
			if(token.trim()) {
				values.push(token.trim());
			}
			token = "";
		} else {
			token += ch;
		}
	}
	if(token.trim()) {
		values.push(token.trim());
	}
	return values;
};

exports.applySnapToPixelValue = function(widget, pixelValue, contextSize, handleSize, element) {
	var points = exports.parseSnapValues(widget);
	var distance = widget.snapDistance ? widget.evaluateCSSValue(widget.snapDistance, contextSize, handleSize) : 8;
	var bestPoint = null;
	var bestDistance = Infinity;
	var pointValue, pointPixelValue, currentDistance, i;

	if(!points.length || !isFinite(pixelValue)) {
		return {
			snapped: false,
			pixelValue: pixelValue,
			formattedValue: widget.formatValueWithUnit(widget.convertFromPixels(pixelValue, widget.unit, contextSize, element), widget.unit),
			snapPoint: ""
		};
	}

	for(i = 0; i < points.length; i++) {
		pointValue = points[i];
		pointPixelValue = widget.evaluateCSSValue(pointValue, contextSize, handleSize);
		currentDistance = Math.abs(pixelValue - pointPixelValue);
		if(currentDistance < bestDistance) {
			bestDistance = currentDistance;
			bestPoint = {
				raw: pointValue,
				pixelValue: pointPixelValue
			};
		}
	}

	if(bestPoint && bestDistance <= distance) {
		if(widget.snapHaptic === "yes" && widget.hapticFeedback === "yes" && widget.triggerHaptic) {
			widget.triggerHaptic(4);
		}
		return {
			snapped: true,
			pixelValue: bestPoint.pixelValue,
			formattedValue: widget.formatValueWithUnit(widget.convertFromPixels(bestPoint.pixelValue, widget.unit, contextSize, element), widget.unit),
			snapPoint: bestPoint.raw,
			distance: bestDistance
		};
	}

	return {
		snapped: false,
		pixelValue: pixelValue,
		formattedValue: widget.formatValueWithUnit(widget.convertFromPixels(pixelValue, widget.unit, contextSize, element), widget.unit),
		snapPoint: "",
		distance: bestDistance
	};
};
