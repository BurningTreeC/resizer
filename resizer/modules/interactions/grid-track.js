/*\
title: $:/plugins/BTC/resizer/modules/interactions/grid-track.js
type: application/javascript
module-type: library

Grid-track mode for the generic BTC resizer widget.

This module adds mode="grid-track" to <$resizer>. It resizes the boundary
between two adjacent CSS Grid column tracks:

	left track  = gridTrackIndex
	right track = gridTrackIndex + 1

The pair total is preserved. The grid is frozen to exact computed pixel tracks
at pointerdown and again at pointerup to avoid initial/end drag jumps.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.executeGridTrackMode = function(domNode, event) {
	var self = this,
		operation;

	if(this.disabled === "yes" || this.disable === "yes") {
		return false;
	}

	var gridElement = this.getGridTrackElement();
	if(!gridElement) {
		return false;
	}

	var contextSize = this.getGridTrackContextSize(gridElement),
		trackSizes = this.getGridTrackSizesPx(gridElement),
		leftIndex = parseInt(this.gridTrackIndex || this.trackIndex || "1", 10) || 1,
		rightIndex = leftIndex + 1,
		leftPx,
		rightPx,
		pairPx,
		minPx,
		maxPx;

	if(!trackSizes.length || trackSizes[leftIndex - 1] === undefined || trackSizes[rightIndex - 1] === undefined) {
		return false;
	}

	leftPx = trackSizes[leftIndex - 1];
	rightPx = trackSizes[rightIndex - 1];
	pairPx = leftPx + rightPx;
	minPx = this.gridTrackToPixels(this.gridTrackMin || this.min || "4%", contextSize, gridElement) || 0;
	maxPx = this.gridTrackMax || this.max ? this.gridTrackToPixels(this.gridTrackMax || this.max, contextSize, gridElement) : null;

	if(pairPx <= 0) {
		return false;
	}

	event.preventDefault();
	event.stopPropagation();

	operation = {
		pointerId: event.pointerId,
		gridElement: gridElement,
		contextSize: contextSize,
		trackSizes: trackSizes,
		leftIndex: leftIndex,
		rightIndex: rightIndex,
		startX: event.clientX,
		leftStartPx: leftPx,
		rightStartPx: rightPx,
		leftCurrentPx: leftPx,
		rightCurrentPx: rightPx,
		pairPx: pairPx,
		minPx: minPx,
		maxPx: maxPx
	};

	if(this.gridTrackFreezeOnStart !== "no" && this.gridTrackLive !== "no") {
		this.freezeGridTrackColumnsToPixels(gridElement, trackSizes);
	}

	domNode.classList.add("tc-resizer-active");

	try {
		domNode.setPointerCapture(event.pointerId);
	} catch(e) {
		// Ignore.
	}

	var onPointerMove = function(moveEvent) {
		self.handleGridTrackPointerMove(domNode, moveEvent, operation);
	};

	var finish = function(upEvent) {
		if(!operation || upEvent.pointerId !== operation.pointerId) {
			return;
		}

		try {
			domNode.releasePointerCapture(operation.pointerId);
		} catch(e) {
			// Ignore.
		}

		self.document.removeEventListener("pointermove", onPointerMove, false);
		self.document.removeEventListener("pointerup", finish, false);
		self.document.removeEventListener("pointercancel", finish, false);

		if(self.gridTrackLive !== "no") {
			self.applyGridTrackLive(operation);
		}

		if(self.gridTrackFreezeOnEnd !== "no") {
			self.saveAllGridTracksFromComputed(operation.gridElement);
		} else if(self.gridTrackSave !== "none") {
			self.saveGridTrackPair(operation);
		}

		domNode.classList.remove("tc-resizer-active");
	};

	this.document.addEventListener("pointermove", onPointerMove, false);
	this.document.addEventListener("pointerup", finish, false);
	this.document.addEventListener("pointercancel", finish, false);

	return true;
};

ResizerWidget.prototype.handleGridTrackPointerMove = function(domNode, event, operation) {
	var delta,
		leftPx,
		rightPx;

	if(!operation || event.pointerId !== operation.pointerId) {
		return;
	}

	event.preventDefault();

	delta = event.clientX - operation.startX;
	leftPx = operation.leftStartPx + delta;

	if(leftPx < operation.minPx) {
		leftPx = operation.minPx;
	}
	if(operation.maxPx !== null && leftPx > operation.maxPx) {
		leftPx = operation.maxPx;
	}
	if(operation.pairPx - leftPx < operation.minPx) {
		leftPx = operation.pairPx - operation.minPx;
	}

	leftPx = this.applyGridTrackSnap(leftPx, operation.contextSize, operation.gridElement);
	rightPx = operation.pairPx - leftPx;

	if(rightPx < operation.minPx) {
		rightPx = operation.minPx;
		leftPx = operation.pairPx - rightPx;
	}

	operation.leftCurrentPx = leftPx;
	operation.rightCurrentPx = rightPx;

	if(this.gridTrackLive !== "no") {
		this.applyGridTrackLive(operation);
	}

	if(this.gridTrackSave === "drag") {
		this.saveGridTrackPair(operation);
	}
};

ResizerWidget.prototype.getGridTrackElement = function() {
	var selector = this.gridSelector || this.gridTrackSelector || "";
	return selector ? this.document.querySelector(selector) : null;
};

ResizerWidget.prototype.getGridTrackContentElement = function(gridElement) {
	return gridElement ? (gridElement.querySelector(".btc-rgrid-content") || gridElement) : null;
};

ResizerWidget.prototype.getGridTrackContextSize = function(gridElement) {
	var content = this.getGridTrackContentElement(gridElement),
		rect;
	if(!content) {
		return 0;
	}
	rect = content.getBoundingClientRect();
	return rect.width || content.clientWidth || 0;
};

ResizerWidget.prototype.getGridTrackSizesPx = function(gridElement) {
	var content = this.getGridTrackContentElement(gridElement),
		result = [],
		parts,
		i,
		value,
		template;

	if(!content) {
		return result;
	}

	try {
		template = this.document.defaultView.getComputedStyle(content).gridTemplateColumns || "";
		parts = template.match(/(?:\([^)]*\)|[^\s])+/g) || [];
		for(i = 0; i < parts.length; i++) {
			value = parseFloat(parts[i]);
			result.push(isNaN(value) ? 0 : value);
		}
	} catch(e) {
		return result;
	}

	return result;
};

ResizerWidget.prototype.getGridTrackVariableName = function(index) {
	return (this.gridTrackCssVariablePrefix || this.cssVariablePrefix || "--btc-rgrid-col-") + index;
};

ResizerWidget.prototype.getGridTrackTiddlerTitle = function(index) {
	var prefix = this.gridTrackStatePrefix || this.statePrefix || this.tiddler || "$:/state/grid";
	return prefix + "/col-" + index;
};

ResizerWidget.prototype.setGridTrackTiddlerValue = function(index, value) {
	this.wiki.setText(this.getGridTrackTiddlerTitle(index), this.gridTrackField || this.field || "text", null, value);
};

ResizerWidget.prototype.getGridTrackRootFontSize = function() {
	try {
		return parseFloat(this.document.defaultView.getComputedStyle(this.document.documentElement).fontSize) || 16;
	} catch(e) {
		return 16;
	}
};

ResizerWidget.prototype.getGridTrackElementFontSize = function(element) {
	try {
		return parseFloat(this.document.defaultView.getComputedStyle(element || this.document.body).fontSize) || this.getGridTrackRootFontSize();
	} catch(e) {
		return this.getGridTrackRootFontSize();
	}
};

ResizerWidget.prototype.gridTrackToPixels = function(value, contextSize, gridElement) {
	var number = parseFloat(value);

	if(isNaN(number)) {
		return 0;
	}
	if(typeof value !== "string") {
		return number;
	}

	value = value.trim();

	if(value.slice(-1) === "%") {
		return contextSize > 0 ? (number * contextSize) / 100 : 0;
	}
	if(value.slice(-3) === "rem") {
		return number * this.getGridTrackRootFontSize();
	}
	if(value.slice(-2) === "em") {
		return number * this.getGridTrackElementFontSize(gridElement);
	}
	if(value.slice(-2) === "px") {
		return number;
	}
	if(value.slice(-2) === "vw") {
		return (number * (this.document.defaultView.innerWidth || 0)) / 100;
	}
	if(value.slice(-2) === "vh") {
		return (number * (this.document.defaultView.innerHeight || 0)) / 100;
	}
	return number;
};

ResizerWidget.prototype.formatGridTrackNumber = function(value, decimals) {
	if(!isFinite(value)) {
		value = 0;
	}
	return value.toFixed(decimals).replace(/\.?0+$/, "");
};

ResizerWidget.prototype.gridTrackFromPixels = function(px, unit, contextSize, gridElement) {
	var value;

	switch(unit) {
		case "%":
			value = contextSize > 0 ? (px * 100) / contextSize : 0;
			return this.formatGridTrackNumber(value, 6) + "%";
		case "rem":
			value = px / this.getGridTrackRootFontSize();
			return this.formatGridTrackNumber(value, 4) + "rem";
		case "em":
			value = px / this.getGridTrackElementFontSize(gridElement);
			return this.formatGridTrackNumber(value, 4) + "em";
		case "px":
		default:
			return this.formatGridTrackNumber(px, 2) + "px";
	}
};

ResizerWidget.prototype.applyGridTrackSnap = function(px, contextSize, gridElement) {
	var snap = this.gridTrackSnap || this.snap || "",
		snapDistance = this.gridTrackToPixels(this.gridTrackSnapDistance || this.snapDistance || "0px", contextSize, gridElement),
		snapValues,
		i,
		snapPx;

	if(!snap || snapDistance <= 0) {
		return px;
	}

	snapValues = snap.split(/\s+/);
	for(i = 0; i < snapValues.length; i++) {
		if(!snapValues[i]) {
			continue;
		}
		snapPx = this.gridTrackToPixels(snapValues[i], contextSize, gridElement);
		if(Math.abs(px - snapPx) <= snapDistance) {
			return snapPx;
		}
	}
	return px;
};

ResizerWidget.prototype.setGridTrackVariable = function(gridElement, index, value) {
	if(gridElement && gridElement.style) {
		gridElement.style.setProperty(this.getGridTrackVariableName(index), value);
	}
};

ResizerWidget.prototype.freezeGridTrackColumnsToPixels = function(gridElement, trackSizes) {
	var i;
	if(!gridElement || !trackSizes || !trackSizes.length) {
		return;
	}
	for(i = 0; i < trackSizes.length; i++) {
		this.setGridTrackVariable(gridElement, i + 1, this.formatGridTrackNumber(trackSizes[i], 2) + "px");
	}
};

ResizerWidget.prototype.saveAllGridTracksFromComputed = function(gridElement) {
	var trackSizes = this.getGridTrackSizesPx(gridElement),
		i,
		value;
	if(!gridElement || !trackSizes || !trackSizes.length) {
		return;
	}
	for(i = 0; i < trackSizes.length; i++) {
		value = this.formatGridTrackNumber(trackSizes[i], 2) + "px";
		this.setGridTrackVariable(gridElement, i + 1, value);
		if(this.gridTrackSave !== "none") {
			this.setGridTrackTiddlerValue(i + 1, value);
		}
	}
};

ResizerWidget.prototype.applyGridTrackLive = function(operation) {
	this.setGridTrackVariable(
		operation.gridElement,
		operation.leftIndex,
		this.gridTrackFromPixels(operation.leftCurrentPx, this.gridTrackLiveUnit || "px", operation.contextSize, operation.gridElement)
	);
	this.setGridTrackVariable(
		operation.gridElement,
		operation.rightIndex,
		this.gridTrackFromPixels(operation.rightCurrentPx, this.gridTrackLiveUnit || "px", operation.contextSize, operation.gridElement)
	);
};

ResizerWidget.prototype.saveGridTrackPair = function(operation) {
	this.setGridTrackTiddlerValue(
		operation.leftIndex,
		this.gridTrackFromPixels(operation.leftCurrentPx, this.gridTrackSaveUnit || this.gridTrackUnit || this.unit || "px", operation.contextSize, operation.gridElement)
	);
	this.setGridTrackTiddlerValue(
		operation.rightIndex,
		this.gridTrackFromPixels(operation.rightCurrentPx, this.gridTrackSaveUnit || this.gridTrackUnit || this.unit || "px", operation.contextSize, operation.gridElement)
	);
};

};
