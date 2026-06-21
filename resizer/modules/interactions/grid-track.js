/*\
title: $:/plugins/BTC/resizer/modules/interactions/grid-track.js
type: application/javascript
module-type: library

Grid-track mode for the generic BTC resizer widget.

This module adds mode="grid-track" to <$resizer>. It resizes the boundary
between two adjacent CSS Grid tracks. It supports both axes:

	gridTrackAxis="column"  resizes grid-template-columns and --btc-rgrid-col-N
	gridTrackAxis="row"     resizes grid-template-rows    and --btc-rgrid-row-N

The pair total is preserved during dragging. If gridTrackFillLast="yes"
and the secondary track is the final track, that final track is frozen to its
actual pixel size during the drag to avoid visual jumps. On save/end it is
restored to gridTrackLastSize, usually 1fr. Its current pixel size is
stored separately as a per-track minimum, for example col-N-min/row-N-min.
That gives the final track minmax(current-px, 1fr), so later container
growth is absorbed by the final track instead of being stuck at a pixel width.

During live drag, the filler track minimum is updated together with the temporary pixel max so an old large -min value cannot block shrinking.

Default-before-state filler model: Final filler tracks without real state skip the plain col-N/row-N read so a stray col-N=1fr or row-N=1fr cannot suppress colDefaults/rowDefaults.  the procedures may use normal defaults for the final track while its state tiddlers are still missing. For rows, the final filler row uses rowDefaults/defaultRowSize until row state exists. A lone final-track state value equal to gridTrackLastSize does not count as initialized state. As soon as col-N-min/row-N-min exists, or a legacy col-N/row-N value different from gridTrackLastSize exists, the runtime restores the final track max to gridTrackLastSize and stores the remembered minimum separately.

Important: track sizes are measured robustly. Some browsers can return
grid-template-columns/grid-template-rows in unresolved forms such as
minmax(..., 1fr). This module therefore falls back to temporary grid probes
instead of blindly parseFloat()ing unresolved track expressions.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.getGridTrackAxis = function() {
	var axis = this.gridTrackAxis || this.trackAxis || this.getAttribute && this.getAttribute("gridTrackAxis", "column") || "column";
	return (/^(row|rows|y|vertical)$/i).test(axis) ? "row" : "column";
};

ResizerWidget.prototype.isGridTrackRowAxis = function(operation) {
	return operation ? operation.axis === "row" : this.getGridTrackAxis() === "row";
};

ResizerWidget.prototype.getGridTrackTrackCount = function(axis, trackSizes) {
	var raw = this.gridTrackTrackCount || this.trackCount || "";
	var count = parseInt(raw, 10);
	if(!isNaN(count) && count > 0) {
		return count;
	}
	return trackSizes && trackSizes.length ? trackSizes.length : 0;
};

ResizerWidget.prototype.getGridTrackLastSize = function(axis) {
	var value = this.gridTrackLastSize || this.lastTrackSize || "";
	return value || "1fr";
};

ResizerWidget.prototype.isGridTrackFillLastEnabled = function() {
	return this.gridTrackFillLast === "yes" || this.fillLastTrack === "yes";
};

ResizerWidget.prototype.isGridTrackLastFillerIndex = function(index, axis, trackSizes) {
	var count;
	if(!this.isGridTrackFillLastEnabled()) {
		return false;
	}
	count = this.getGridTrackTrackCount(axis, trackSizes);
	return count > 0 && index === count;
};

ResizerWidget.prototype.operationUsesGridTrackLastFiller = function(operation) {
	return !!(operation && operation.fillLast && operation.rightIsLastFiller);
};

ResizerWidget.prototype.parseResolvedGridTrackSizesPx = function(template) {
	var result = [],
		parts,
		i,
		part,
		value;

	parts = (template || "").match(/(?:\([^)]*\)|[^\s])+/g) || [];
	for(i = 0; i < parts.length; i++) {
		part = parts[i];

		/*
			Only trust plain resolved pixel track tokens. Do not parse
			minmax(...), repeat(...), calc(...), or fr tokens as pixels.
			parseFloat("minmax(0px, 1fr)") would incorrectly become 0.
		*/
		if(!/^-?(?:\d+|\d*\.\d+)px$/i.test(part)) {
			return [];
		}

		value = parseFloat(part);
		if(isNaN(value)) {
			return [];
		}
		result.push(value);
	}
	return result;
};

ResizerWidget.prototype.measureGridTrackSizesWithProbes = function(gridElement, axis, expectedCount) {
	var content = this.getGridTrackContentElement(gridElement),
		isRowAxis = (axis || this.getGridTrackAxis()) === "row",
		count = parseInt(expectedCount, 10),
		result = [],
		probes = [],
		probe,
		rect,
		i;

	if(!content || isNaN(count) || count <= 0) {
		return result;
	}

	try {
		for(i = 1; i <= count; i++) {
			probe = this.document.createElement("div");
			probe.className = "btc-rgrid-track-measure-probe";
			probe.setAttribute("data-btc-rgrid-track-measure-probe", "yes");

			probe.style.boxSizing = "border-box";
			probe.style.minWidth = "0";
			probe.style.minHeight = "0";
			probe.style.width = "auto";
			probe.style.height = "auto";
			probe.style.padding = "0";
			probe.style.margin = "0";
			probe.style.border = "0";
			probe.style.overflow = "hidden";
			probe.style.visibility = "hidden";
			probe.style.pointerEvents = "none";
			probe.style.zIndex = "-1";

			if(isRowAxis) {
				probe.style.gridColumn = "1 / span 1";
				probe.style.gridRow = i + " / span 1";
			} else {
				probe.style.gridColumn = i + " / span 1";
				probe.style.gridRow = "1 / span 1";
			}

			content.appendChild(probe);
			probes.push(probe);
		}

		for(i = 0; i < probes.length; i++) {
			rect = probes[i].getBoundingClientRect();
			result.push(isRowAxis ? (rect.height || 0) : (rect.width || 0));
		}
	} catch(e) {
		result = [];
	}

	for(i = 0; i < probes.length; i++) {
		if(probes[i] && probes[i].parentNode) {
			probes[i].parentNode.removeChild(probes[i]);
		}
	}

	return result;
};

ResizerWidget.prototype.executeGridTrackMode = function(domNode, event) {
	var self = this,
		operation;

	if(this.disabled === "yes" || this.disable === "yes") {
		return false;
	}

	var gridElement = this.getGridTrackElement(domNode);
	if(!gridElement) {
		return false;
	}

	var axis = this.getGridTrackAxis(),
		isRowAxis = axis === "row",
		contextSize = this.getGridTrackContextSize(gridElement, axis),
		trackSizes = this.getGridTrackSizesPx(gridElement, axis),
		trackCount = this.getGridTrackTrackCount(axis, trackSizes),
		fillLast = this.isGridTrackFillLastEnabled(),
		lastSize = this.getGridTrackLastSize(axis),
		leftIndex = parseInt(this.gridTrackIndex || this.trackIndex || "1", 10) || 1,
		rightIndex = leftIndex + 1,
		rightIsLastFiller,
		leftPx,
		rightPx,
		pairPx,
		minPx,
		maxPx;

	if(!trackSizes.length || trackSizes[leftIndex - 1] === undefined || trackSizes[rightIndex - 1] === undefined) {
		return false;
	}

	rightIsLastFiller = fillLast && trackCount > 0 && rightIndex === trackCount;

	leftPx = trackSizes[leftIndex - 1];
	rightPx = trackSizes[rightIndex - 1];
	pairPx = leftPx + rightPx;
	minPx = this.gridTrackToPixels(this.gridTrackMin || this.min || (isRowAxis ? "2rem" : "4%"), contextSize, gridElement) || 0;
	maxPx = this.gridTrackMax || this.max ? this.gridTrackToPixels(this.gridTrackMax || this.max, contextSize, gridElement) : null;

	if(pairPx <= 0) {
		return false;
	}

	event.preventDefault();
	event.stopPropagation();

	operation = {
		pointerId: event.pointerId,
		axis: axis,
		isRowAxis: isRowAxis,
		gridElement: gridElement,
		contextSize: contextSize,
		trackSizes: trackSizes,
		leftIndex: leftIndex,
		rightIndex: rightIndex,
		startX: event.clientX,
		startY: event.clientY,
		startPointer: isRowAxis ? event.clientY : event.clientX,
		leftStartPx: leftPx,
		rightStartPx: rightPx,
		leftCurrentPx: leftPx,
		rightCurrentPx: rightPx,
		pairPx: pairPx,
		minPx: minPx,
		maxPx: maxPx,
		trackCount: trackCount,
		fillLast: fillLast,
		lastSize: lastSize,
		rightIsLastFiller: rightIsLastFiller
	};

	if(this.gridTrackFreezeOnStart !== "no" && this.gridTrackLive !== "no") {
		this.freezeGridTracksToPixels(gridElement, trackSizes, axis);
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
			self.saveAllGridTracksFromComputed(operation.gridElement, operation.axis);
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
		rightPx,
		pointer;

	if(!operation || event.pointerId !== operation.pointerId) {
		return;
	}

	event.preventDefault();

	pointer = operation.isRowAxis ? event.clientY : event.clientX;
	delta = pointer - operation.startPointer;
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

ResizerWidget.prototype.getGridTrackElement = function(domNode) {
	var selector = this.gridSelector || this.gridTrackSelector || "",
		node = domNode || this.domNode || (this.domNodes && this.domNodes[0]);

	/*
		Resolve the grid that actually contains this resizer rather than the
		first document-wide match for the selector. gridId is decoupled from
		statePrefix, so several placed/xy tables can share the same
		.btc-rgrid-instance-* class. A global querySelector would then return
		the wrong grid and cross-wire the handle, collapsing a column. Walking
		up from the resizer's own DOM node keeps each handle bound to its grid.
	*/
	if(node && node.closest) {
		if(selector) {
			var scoped = node.closest(selector);
			if(scoped) {
				return scoped;
			}
		}
		var ownGrid = node.closest(".btc-rgrid-table");
		if(ownGrid) {
			return ownGrid;
		}
	}

	return selector ? this.document.querySelector(selector) : null;
};

ResizerWidget.prototype.getGridTrackContentElement = function(gridElement) {
	return gridElement ? (gridElement.querySelector(".btc-rgrid-content") || gridElement) : null;
};

ResizerWidget.prototype.getGridTrackContextSize = function(gridElement, axis) {
	var content = this.getGridTrackContentElement(gridElement),
		rect,
		isRowAxis = (axis || this.getGridTrackAxis()) === "row";
	if(!content) {
		return 0;
	}
	rect = content.getBoundingClientRect();
	return isRowAxis ? (rect.height || content.clientHeight || 0) : (rect.width || content.clientWidth || 0);
};

ResizerWidget.prototype.getGridTrackSizesPx = function(gridElement, axis) {
	var content = this.getGridTrackContentElement(gridElement),
		result = [],
		template,
		style,
		trackAxis = axis || this.getGridTrackAxis(),
		isRowAxis = trackAxis === "row",
		expectedCount = parseInt(this.gridTrackTrackCount || this.trackCount || "0", 10);

	if(!content) {
		return result;
	}

	try {
		style = this.document.defaultView.getComputedStyle(content);
		template = isRowAxis ? (style.gridTemplateRows || "") : (style.gridTemplateColumns || "");

		result = this.parseResolvedGridTrackSizesPx(template);

		if(result.length && (!expectedCount || result.length >= expectedCount)) {
			return expectedCount > 0 ? result.slice(0, expectedCount) : result;
		}

		if(expectedCount > 0) {
			result = this.measureGridTrackSizesWithProbes(gridElement, trackAxis, expectedCount);
			if(result.length) {
				return result;
			}
		}
	} catch(e) {
		return [];
	}

	return result;
};

ResizerWidget.prototype.getGridTrackVariablePrefix = function(axis) {
	var isRowAxis = (axis || this.getGridTrackAxis()) === "row";
	return this.gridTrackCssVariablePrefix || this.cssVariablePrefix || (isRowAxis ? "--btc-rgrid-row-" : "--btc-rgrid-col-");
};

ResizerWidget.prototype.getGridTrackVariableName = function(index, axis, suffix) {
	return this.getGridTrackVariablePrefix(axis) + index + (suffix || "");
};

ResizerWidget.prototype.getGridTrackTiddlerTitle = function(index, axis, suffix) {
	var prefix = this.gridTrackStatePrefix || this.statePrefix || this.tiddler || "$:/state/grid";
	return prefix + ((axis || this.getGridTrackAxis()) === "row" ? "/row-" : "/col-") + index + (suffix || "");
};

ResizerWidget.prototype.setGridTrackTiddlerValue = function(index, value, axis, suffix) {
	this.wiki.setText(this.getGridTrackTiddlerTitle(index, axis, suffix), this.gridTrackField || this.field || "text", null, value);
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
		case "vh":
			value = (this.document.defaultView.innerHeight || 0) > 0 ? (px * 100) / (this.document.defaultView.innerHeight || 1) : 0;
			return this.formatGridTrackNumber(value, 6) + "vh";
		case "vw":
			value = (this.document.defaultView.innerWidth || 0) > 0 ? (px * 100) / (this.document.defaultView.innerWidth || 1) : 0;
			return this.formatGridTrackNumber(value, 6) + "vw";
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

ResizerWidget.prototype.setGridTrackVariable = function(gridElement, index, value, axis, suffix) {
	if(gridElement && gridElement.style) {
		gridElement.style.setProperty(this.getGridTrackVariableName(index, axis, suffix), value);
	}
};

ResizerWidget.prototype.setGridTrackMinVariable = function(gridElement, index, value, axis) {
	this.setGridTrackVariable(gridElement, index, value, axis, "-min");
};

ResizerWidget.prototype.setGridTrackMinTiddlerValue = function(index, value, axis) {
	this.setGridTrackTiddlerValue(index, value, axis, "-min");
};

ResizerWidget.prototype.saveGridTrackFillerValue = function(gridElement, index, px, axis) {
	var minValue = this.formatGridTrackNumber(px, 2) + "px",
		lastSize = this.getGridTrackLastSize(axis);

	this.setGridTrackMinVariable(gridElement, index, minValue, axis);
	this.setGridTrackVariable(gridElement, index, lastSize, axis);

	if(this.gridTrackSave !== "none") {
		this.setGridTrackMinTiddlerValue(index, minValue, axis);
		this.setGridTrackTiddlerValue(index, lastSize, axis);
	}
};

ResizerWidget.prototype.freezeGridTracksToPixels = function(gridElement, trackSizes, axis) {
	var i;
	if(!gridElement || !trackSizes || !trackSizes.length) {
		return;
	}
	for(i = 0; i < trackSizes.length; i++) {
		this.setGridTrackVariable(gridElement, i + 1, this.formatGridTrackNumber(trackSizes[i], 2) + "px", axis);
	}
};

// Backwards-compatible old name. It now freezes the active axis.
ResizerWidget.prototype.freezeGridTrackColumnsToPixels = function(gridElement, trackSizes) {
	this.freezeGridTracksToPixels(gridElement, trackSizes, this.getGridTrackAxis());
};

ResizerWidget.prototype.saveAllGridTracksFromComputed = function(gridElement, axis) {
	var trackAxis = axis || this.getGridTrackAxis(),
		trackSizes = this.getGridTrackSizesPx(gridElement, trackAxis),
		i,
		index,
		value;
	if(!gridElement || !trackSizes || !trackSizes.length) {
		return;
	}
	for(i = 0; i < trackSizes.length; i++) {
		index = i + 1;
		if(this.isGridTrackLastFillerIndex(index, trackAxis, trackSizes)) {
			this.saveGridTrackFillerValue(gridElement, index, trackSizes[i], trackAxis);
		} else {
			value = this.formatGridTrackNumber(trackSizes[i], 2) + "px";
			this.setGridTrackVariable(gridElement, index, value, trackAxis);
			if(this.gridTrackSave !== "none") {
				this.setGridTrackTiddlerValue(index, value, trackAxis);
			}
		}
	}
};

ResizerWidget.prototype.applyGridTrackLive = function(operation) {
	var unit = this.gridTrackLiveUnit || "px",
		rightValue;

	this.setGridTrackVariable(
		operation.gridElement,
		operation.leftIndex,
		this.gridTrackFromPixels(operation.leftCurrentPx, unit, operation.contextSize, operation.gridElement),
		operation.axis
	);

	rightValue = this.gridTrackFromPixels(operation.rightCurrentPx, "px", operation.contextSize, operation.gridElement);

	if(this.operationUsesGridTrackLastFiller(operation)) {
		this.setGridTrackMinVariable(
			operation.gridElement,
			operation.rightIndex,
			rightValue,
			operation.axis
		);
		this.setGridTrackVariable(
			operation.gridElement,
			operation.rightIndex,
			rightValue,
			operation.axis
		);
	} else {
		this.setGridTrackVariable(
			operation.gridElement,
			operation.rightIndex,
			this.gridTrackFromPixels(operation.rightCurrentPx, unit, operation.contextSize, operation.gridElement),
			operation.axis
		);
	}
};

ResizerWidget.prototype.saveGridTrackPair = function(operation) {
	var unit = this.gridTrackSaveUnit || this.gridTrackUnit || this.unit || "px";
	this.setGridTrackTiddlerValue(
		operation.leftIndex,
		this.gridTrackFromPixels(operation.leftCurrentPx, unit, operation.contextSize, operation.gridElement),
		operation.axis
	);
	if(this.operationUsesGridTrackLastFiller(operation)) {
		this.saveGridTrackFillerValue(
			operation.gridElement,
			operation.rightIndex,
			operation.rightCurrentPx,
			operation.axis
		);
	} else {
		this.setGridTrackTiddlerValue(
			operation.rightIndex,
			this.gridTrackFromPixels(operation.rightCurrentPx, unit, operation.contextSize, operation.gridElement),
			operation.axis
		);
	}
};

};
