/*\
title: $:/plugins/BTC/resizer/modules/utils/presets.js
type: application/javascript
module-type: library

Optional double-click preset cycling for BTC resizer widgets.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var parsePresets = function(raw) {
	var result = [];
	var parts = (raw || "").split(/[;|\n]+/);
	var i, part, idx, name, value;

	for(i = 0; i < parts.length; i++) {
		part = parts[i].trim();
		if(!part) {
			continue;
		}
		idx = part.indexOf(":");
		if(idx > -1) {
			name = part.substring(0, idx).trim();
			value = part.substring(idx + 1).trim();
		} else {
			name = String(result.length);
			value = part;
		}
		if(value) {
			result.push({name: name, value: value});
		}
	}
	return result;
};

var findCurrentIndex = function(widget, presets) {
	var indexText, index, mode, i, currentValue;

	if(widget.presetIndexTiddler) {
		indexText = widget.wiki.getTiddlerText(widget.presetIndexTiddler, "-1");
		index = parseInt(indexText, 10);
		if(!isNaN(index)) {
			return index;
		}
	}

	if(widget.presetTiddler) {
		mode = widget.wiki.getTiddlerText(widget.presetTiddler, "");
		for(i = 0; i < presets.length; i++) {
			if(presets[i].name === mode) {
				return i;
			}
		}
	}

	currentValue = null;
	if(widget.targetTiddlers && widget.targetTiddlers.length > 0) {
		currentValue = widget.getTiddlerValue(widget.targetTiddlers[0]);
	} else if(widget.targetTiddler) {
		currentValue = widget.getTiddlerValue(widget.targetTiddler);
	}
	if(currentValue) {
		for(i = 0; i < presets.length; i++) {
			if(presets[i].value === currentValue) {
				return i;
			}
		}
	}

	return -1;
};

exports.applyNextPreset = function(widget, domNode) {
	var presets = parsePresets(widget.presets);
	var currentIndex, nextIndex, preset, targetElements;

	if(!presets.length) {
		return false;
	}

	currentIndex = findCurrentIndex(widget, presets);
	nextIndex = (currentIndex + 1) % presets.length;
	preset = presets[nextIndex];

	if(widget.targetTiddlers && widget.targetTiddlers.length > 0) {
		$tw.utils.each(widget.targetTiddlers, function(tiddlerTitle) {
			widget.wiki.setText(tiddlerTitle, widget.targetField || "text", null, preset.value);
		});
	} else if(widget.targetTiddler) {
		widget.wiki.setText(widget.targetTiddler, widget.targetField || "text", null, preset.value);
	}

	if(widget.presetTiddler) {
		widget.wiki.setText(widget.presetTiddler, widget.presetField || "text", null, preset.name);
	}
	if(widget.presetIndexTiddler) {
		widget.wiki.setText(widget.presetIndexTiddler, widget.presetIndexField || "text", null, String(nextIndex));
	}

	targetElements = widget.getTargetElements(domNode);
	$tw.utils.each(targetElements, function(element) {
		if(element && widget.liveResize === "yes") {
			element.style[widget.targetProperty] = preset.value;
			if(widget.targetProperty === "width" || widget.targetProperty === "height" || widget.targetProperty === "flexBasis") {
				element.style.flexBasis = preset.value;
			}
		}
		widget.publishCSSVariable(preset.value, element);
	});

	widget.setVariable("tv-action-preset-name", preset.name);
	widget.setVariable("tv-action-preset-value", preset.value);
	widget.setVariable("tv-action-preset-index", String(nextIndex));

	if(widget.hapticFeedback === "yes" && widget.triggerHaptic) {
		widget.triggerHaptic([8, 30, 8]);
	}

	return true;
};
