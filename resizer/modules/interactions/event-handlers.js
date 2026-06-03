/*\
title: $:/plugins/BTC/resizer/modules/interactions/event-handlers.js
type: application/javascript
module-type: library

Extracted compatibility module for the BTC resizer widget.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var GlobalResizerManager = require("$:/plugins/BTC/resizer/modules/utils/global-manager.js").GlobalResizerManager;

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.addEventHandlers = function(domNode) {
	var self = this;
	
	// Store domNode reference for cleanup
	self.domNode = domNode;
	
	// Store active resize operations by pointer ID with cleanup timeout
	self.activeResizeOperations = {};
	self.operationTimeouts = {}; // Track timeouts for stale operation cleanup
	// Limited parent size cache with LRU eviction to prevent memory growth
	self.parentSizeCache = {};
	self.parentSizeCacheOrder = []; // Track access order for LRU
	self.maxCacheSize = 10; // Limit cache size to prevent unbounded growth
	var aspectRatioValue = null;
	
	// Helper to manage parent size cache with LRU eviction
	var updateParentSizeCache = function(key, value) {
		// Remove key from order if it exists
		var index = self.parentSizeCacheOrder.indexOf(key);
		if(index > -1) {
			self.parentSizeCacheOrder.splice(index, 1);
		}
		// Add key to end (most recently used)
		self.parentSizeCacheOrder.push(key);
		// Store value
		self.parentSizeCache[key] = value;
		// Evict oldest if cache is too large
		if(self.parentSizeCacheOrder.length > self.maxCacheSize) {
			var oldestKey = self.parentSizeCacheOrder.shift();
			delete self.parentSizeCache[oldestKey];
		}
	};
	
	// Parse aspect ratio
	if(self.aspectRatio) {
		if(self.aspectRatio.indexOf(":") > -1) {
			var parts = self.aspectRatio.split(":");
			aspectRatioValue = parseFloat(parts[0]) / parseFloat(parts[1]);
		} else {
			aspectRatioValue = parseFloat(self.aspectRatio);
		}
	}
	
	// Helper to get numeric value from a string with units
	var getNumericValue = function(value) {
		return parseFloat(value) || 0;
	};
	
	// Helper to get the handle width/height
	var getHandleSize = function() {
		// Get the computed size of the handle
		var computedStyle = self.document.defaultView.getComputedStyle(domNode);
		if(self.direction === "horizontal") {
			return parseFloat(computedStyle.width) || 0;
		} else {
			return parseFloat(computedStyle.height) || 0;
		}
	};
	// Helper to get parent size for percentage calculations
	var getParentSize = function(element, forceFreshMeasurement) {
		if(!element || !element.parentElement) return 0;
		var parentElement = element.parentElement;
		
		// If forced fresh measurement, ensure we get current layout
		if(forceFreshMeasurement) {
			// Force a reflow to get accurate measurements
			parentElement.offsetHeight; // Reading offsetHeight forces reflow
		}
		
		if(self.position === "relative") {
			return self.direction === "horizontal" ? parentElement.offsetWidth : parentElement.offsetHeight;
		} else {
			var parentRect = parentElement.getBoundingClientRect();
			return self.direction === "horizontal" ? parentRect.width : parentRect.height;
		}
	};
	
	

	// Helper to preserve the exact pointer offset from the moving resize boundary.
	//
	// The pointer position itself is not necessarily the resize boundary because
	// the user may grab the handle at any point inside its thickness. The only
	// offset that must be preserved is:
	//
	//   pointerToResizeBoundaryOffset = pointerCoordinate - resizeBoundaryAtStart
	//
	// During pointermove we reconstruct:
	//
	//   resizeBoundaryNow = pointerCoordinate - pointerToResizeBoundaryOffset
	//
	// For inverted right/bottom panels, the fixed edge is right/bottom and the
	// moving boundary is left/top. For normal left/top panels, the fixed edge is
	// left/top and the moving boundary is right/bottom.
	//
	// Important: resizeBoundaryAtStart is derived from operation.startValue, not
	// from the target element's raw border box. That keeps visiblePortion="yes"
	// and normal measured widths in the same coordinate system.
	var setupHandleGrabOffset = function(event, operation) {
		if(!operation || !operation.targetElement) {
			return;
		}

		var targetRect = operation.targetElement.getBoundingClientRect();
		var startValue = Math.max(operation.startValue || 0, 0);
		var fixedEdge;
		var boundaryAtStart;
		var pointerCoordinate = self.direction === "horizontal" ? event.clientX : event.clientY;

		if(self.direction === "horizontal") {
			if(self.invertDirection === "yes") {
				// Right-side panel/sidebar:
				// right edge is fixed, left boundary moves.
				fixedEdge = targetRect.right;
				boundaryAtStart = fixedEdge - startValue;
			} else {
				// Left-side panel:
				// left edge is fixed, right boundary moves.
				fixedEdge = targetRect.left;
				boundaryAtStart = fixedEdge + startValue;
			}
		} else {
			if(self.invertDirection === "yes") {
				// Bottom-side panel:
				// bottom edge is fixed, top boundary moves.
				fixedEdge = targetRect.bottom;
				boundaryAtStart = fixedEdge - startValue;
			} else {
				// Top-side panel:
				// top edge is fixed, bottom boundary moves.
				fixedEdge = targetRect.top;
				boundaryAtStart = fixedEdge + startValue;
			}
		}

		operation.resizeFixedEdgeAtStart = fixedEdge;
		operation.resizeBoundaryAtStart = boundaryAtStart;
		operation.pointerToResizeBoundaryOffset = pointerCoordinate - boundaryAtStart;
	};

	var getHandleGrabOffsetPixelDelta = function(event, operation) {
		if(!operation ||
				operation.pointerToResizeBoundaryOffset === undefined ||
				operation.pointerToResizeBoundaryOffset === null ||
				operation.resizeFixedEdgeAtStart === undefined ||
				operation.resizeFixedEdgeAtStart === null) {
			return null;
		}

		var pointerCoordinate = self.direction === "horizontal" ? event.clientX : event.clientY;
		var movingBoundary = pointerCoordinate - operation.pointerToResizeBoundaryOffset;
		var newPixelValue;

		if(self.invertDirection === "yes") {
			newPixelValue = operation.resizeFixedEdgeAtStart - movingBoundary;
		} else {
			newPixelValue = movingBoundary - operation.resizeFixedEdgeAtStart;
		}

		newPixelValue = Math.max(newPixelValue, 0);
		return newPixelValue - operation.startValue;
	};


	// Helper to resolve the primary/secondary elements and tiddlers for split-pair mode.
	// horizontal: primary = left, secondary = right
	// vertical:   primary = top,  secondary = bottom
	// This mode is intentionally additive: it does not remove the old single/multiple logic.
	var setupSplitPairOperation = function(operation) {
		if(self.resizeMode !== "split-pair") {
			return;
		}

		var isHorizontal = self.direction === "horizontal";
		var primaryElement = null;
		var secondaryElement = null;

		var primarySelector = isHorizontal ? self.leftSelector : self.topSelector;
		var secondarySelector = isHorizontal ? self.rightSelector : self.bottomSelector;

		if(primarySelector) {
			primaryElement = self.document.querySelector(primarySelector);
		}
		if(!primaryElement) {
			primaryElement = operation.targetElement || (operation.targetElements && operation.targetElements[0]) || null;
		}

		if(secondarySelector) {
			secondaryElement = self.document.querySelector(secondarySelector);
		}

		// Resolve the secondary pane without accidentally selecting the resizer
		// handle itself. There are two common and valid layouts:
		//
		// 1) Handle between panes:
		//    <left-pane/> <resizer/> <right-pane/>
		//    primaryElement is domNode.previousElementSibling and the secondary
		//    pane is domNode.nextElementSibling. Using
		//    primaryElement.nextElementSibling would incorrectly return the
		//    resizer handle.
		//
		// 2) Handle inside the first pane:
		//    <left-pane><resizer/></left-pane> <right-pane/>
		//    primaryElement is domNode.parentElement and the secondary pane is
		//    primaryElement.nextElementSibling.
		//
		// The fallback below supports both patterns and skips any resizer handles
		// it encounters. This keeps existing element="parent" layouts intact
		// while fixing element="previousSibling" layouts where the handle is
		// placed between panes.
		var findSecondaryElement = function(primaryElement, handleElement) {
			var sibling;

			if(!primaryElement) {
				return null;
			}

			if(primaryElement.nextElementSibling === handleElement) {
				sibling = handleElement.nextElementSibling;
			} else {
				sibling = primaryElement.nextElementSibling;
			}

			while(sibling && sibling.classList && sibling.classList.contains("tc-resizer")) {
				sibling = sibling.nextElementSibling;
			}

			return sibling || null;
		};

		if(!secondaryElement && primaryElement) {
			secondaryElement = findSecondaryElement(primaryElement, domNode);
		}

		var primaryTiddler = isHorizontal
			? (self.leftTiddler || self.targetTiddler || (self.targetTiddlers && self.targetTiddlers[0]))
			: (self.topTiddler || self.targetTiddler || (self.targetTiddlers && self.targetTiddlers[0]));

		var secondaryTiddler = isHorizontal
			? (self.rightTiddler || (self.targetTiddlers && self.targetTiddlers[1]))
			: (self.bottomTiddler || (self.targetTiddlers && self.targetTiddlers[1]));

		var primaryField = isHorizontal
			? (self.leftField || self.targetField || "text")
			: (self.topField || self.targetField || "text");

		var secondaryField = isHorizontal
			? (self.rightField || self.targetField || "text")
			: (self.bottomField || self.targetField || "text");

		if(!primaryElement || !secondaryElement || !primaryTiddler || !secondaryTiddler) {
			if(self.hapticDebug === "yes") {
				console.warn("Resizer split-pair mode could not resolve primary/secondary element or tiddler", {
					direction: self.direction,
					primaryElement: primaryElement,
					secondaryElement: secondaryElement,
					primaryTiddler: primaryTiddler,
					secondaryTiddler: secondaryTiddler
				});
			}
			return;
		}

		var primaryRect = primaryElement.getBoundingClientRect();
		var secondaryRect = secondaryElement.getBoundingClientRect();

		var primaryStartPx = isHorizontal ? primaryRect.width : primaryRect.height;
		var secondaryStartPx = isHorizontal ? secondaryRect.width : secondaryRect.height;
		var pairStartPx = primaryStartPx + secondaryStartPx;

		var parentSize = operation.parentSizeAtStart || getParentSize(primaryElement, true);
		var handleSize = operation.handleSize || getHandleSize();

		var minPx = self.minValueRaw ? self.evaluateCSSValue(self.minValueRaw, parentSize, handleSize) : 0;
		var maxPx = self.maxValueRaw ? self.evaluateCSSValue(self.maxValueRaw, parentSize, handleSize) : null;

		minPx = Math.max(minPx || 0, 0);
		if(maxPx !== null) {
			maxPx = Math.max(maxPx, 0);
		}

		operation.splitPair = {
			direction: self.direction,
			isHorizontal: isHorizontal,

			primaryName: isHorizontal ? "left" : "top",
			secondaryName: isHorizontal ? "right" : "bottom",

			primaryElement: primaryElement,
			secondaryElement: secondaryElement,

			primaryTiddler: primaryTiddler,
			secondaryTiddler: secondaryTiddler,

			primaryField: primaryField,
			secondaryField: secondaryField,

			primaryStartPx: primaryStartPx,
			secondaryStartPx: secondaryStartPx,
			pairStartPx: pairStartPx,

			parentSizeAtStart: parentSize,
			minPx: minPx,
			maxPx: maxPx,

			currentPrimaryPx: primaryStartPx,
			currentSecondaryPx: secondaryStartPx,
			lastClampedDelta: 0
		};

		// Backwards compatibility for generic callbacks:
		// horizontal => left side; vertical => top side.
		operation.startValue = primaryStartPx;
		operation.targetElement = primaryElement;
		if(!operation.targetElements || operation.targetElements.length === 0) {
			operation.targetElements = [primaryElement];
		}
	};

	var formatSplitPairValue = function(pixelValue, element, parentSize) {
		var convertedValue = self.convertFromPixels(pixelValue, self.unit, parentSize, element);
		return self.formatValueWithUnit(convertedValue, self.unit);
	};

	var setSplitPairActionVariables = function(operation, requestedDelta, phase) {
		if(!operation || !operation.splitPair) {
			return;
		}

		var pair = operation.splitPair;
		var parentSize = pair.parentSizeAtStart || operation.parentSizeAtStart || 0;

		var primaryPx = pair.currentPrimaryPx;
		var secondaryPx = pair.currentSecondaryPx;
		var clampedDelta = pair.lastClampedDelta || 0;

		var primaryPercent = parentSize > 0 ? (primaryPx * 100) / parentSize : 0;
		var secondaryPercent = parentSize > 0 ? (secondaryPx * 100) / parentSize : 0;
		var pairPercent = parentSize > 0 ? (pair.pairStartPx * 100) / parentSize : 0;
		var deltaPercent = parentSize > 0 ? (clampedDelta * 100) / parentSize : 0;
		var requestedDeltaPercent = parentSize > 0 ? ((requestedDelta || 0) * 100) / parentSize : 0;

		var primaryFormatted = formatSplitPairValue(primaryPx, pair.primaryElement, parentSize);
		var secondaryFormatted = formatSplitPairValue(secondaryPx, pair.secondaryElement, parentSize);

		// Existing generic variables point to the primary side.
		self.setVariable("tv-action-value", self.convertFromPixels(primaryPx, self.unit, parentSize, pair.primaryElement).toString());
		self.setVariable("tv-action-value-pixels", primaryPx.toString());
		self.setVariable("tv-action-formatted-value", primaryFormatted);
		self.setVariable("tv-action-value-percent-of-parent", primaryPercent.toString());
		self.setVariable("tv-action-formatted-value-percent-of-parent", self.formatValueWithUnit(primaryPercent, "%"));

		self.setVariable("tv-action-delta-pixels", clampedDelta.toString());
		self.setVariable("tv-action-delta-percent-of-parent", deltaPercent.toString());
		self.setVariable("tv-action-formatted-delta-percent-of-parent", self.formatValueWithUnit(deltaPercent, "%"));

		self.setVariable("tv-action-requested-delta-pixels", (requestedDelta || 0).toString());
		self.setVariable("tv-action-requested-delta-percent-of-parent", requestedDeltaPercent.toString());

		self.setVariable("tv-action-phase", phase || "");
		self.setVariable("tv-action-split-pair", "yes");
		self.setVariable("tv-action-split-pair-direction", pair.direction);

		self.setVariable("tv-action-primary-tiddler", pair.primaryTiddler || "");
		self.setVariable("tv-action-secondary-tiddler", pair.secondaryTiddler || "");
		self.setVariable("tv-action-primary-field", pair.primaryField || "text");
		self.setVariable("tv-action-secondary-field", pair.secondaryField || "text");

		self.setVariable("tv-action-primary-value-pixels", primaryPx.toString());
		self.setVariable("tv-action-secondary-value-pixels", secondaryPx.toString());
		self.setVariable("tv-action-primary-value-percent-of-parent", primaryPercent.toString());
		self.setVariable("tv-action-secondary-value-percent-of-parent", secondaryPercent.toString());
		self.setVariable("tv-action-formatted-primary-value-percent-of-parent", self.formatValueWithUnit(primaryPercent, "%"));
		self.setVariable("tv-action-formatted-secondary-value-percent-of-parent", self.formatValueWithUnit(secondaryPercent, "%"));
		self.setVariable("tv-action-primary-formatted-value", primaryFormatted);
		self.setVariable("tv-action-secondary-formatted-value", secondaryFormatted);

		self.setVariable("tv-action-primary-start-value-pixels", pair.primaryStartPx.toString());
		self.setVariable("tv-action-secondary-start-value-pixels", pair.secondaryStartPx.toString());

		self.setVariable("tv-action-pair-size-pixels", pair.pairStartPx.toString());
		self.setVariable("tv-action-pair-size-percent-of-parent", pairPercent.toString());
		self.setVariable("tv-action-formatted-pair-size-percent-of-parent", self.formatValueWithUnit(pairPercent, "%"));

		self.setVariable("tv-action-min-value-pixels", pair.minPx.toString());
		self.setVariable("tv-action-max-value-pixels", pair.maxPx === null ? "" : pair.maxPx.toString());

		// Direction-specific aliases.
		if(pair.direction === "horizontal") {
			self.setVariable("tv-action-left-tiddler", pair.primaryTiddler || "");
			self.setVariable("tv-action-right-tiddler", pair.secondaryTiddler || "");
			self.setVariable("tv-action-left-field", pair.primaryField || "text");
			self.setVariable("tv-action-right-field", pair.secondaryField || "text");

			self.setVariable("tv-action-left-value-pixels", primaryPx.toString());
			self.setVariable("tv-action-right-value-pixels", secondaryPx.toString());
			self.setVariable("tv-action-left-value-percent-of-parent", primaryPercent.toString());
			self.setVariable("tv-action-right-value-percent-of-parent", secondaryPercent.toString());
			self.setVariable("tv-action-formatted-left-value-percent-of-parent", self.formatValueWithUnit(primaryPercent, "%"));
			self.setVariable("tv-action-formatted-right-value-percent-of-parent", self.formatValueWithUnit(secondaryPercent, "%"));
			self.setVariable("tv-action-left-formatted-value", primaryFormatted);
			self.setVariable("tv-action-right-formatted-value", secondaryFormatted);
		} else {
			self.setVariable("tv-action-top-tiddler", pair.primaryTiddler || "");
			self.setVariable("tv-action-bottom-tiddler", pair.secondaryTiddler || "");
			self.setVariable("tv-action-top-field", pair.primaryField || "text");
			self.setVariable("tv-action-bottom-field", pair.secondaryField || "text");

			self.setVariable("tv-action-top-value-pixels", primaryPx.toString());
			self.setVariable("tv-action-bottom-value-pixels", secondaryPx.toString());
			self.setVariable("tv-action-top-value-percent-of-parent", primaryPercent.toString());
			self.setVariable("tv-action-bottom-value-percent-of-parent", secondaryPercent.toString());
			self.setVariable("tv-action-formatted-top-value-percent-of-parent", self.formatValueWithUnit(primaryPercent, "%"));
			self.setVariable("tv-action-formatted-bottom-value-percent-of-parent", self.formatValueWithUnit(secondaryPercent, "%"));
			self.setVariable("tv-action-top-formatted-value", primaryFormatted);
			self.setVariable("tv-action-bottom-formatted-value", secondaryFormatted);
		}
	};

	var updateSplitPairValues = function(pixelDelta, operation) {
		var pair = operation.splitPair;
		if(!pair) {
			return;
		}

		// Optional snap points for the primary side. This is additive and disabled
		// unless snap="..." is supplied.
		if(self.snap) {
			var splitSnapResult = self.applySnapToPixelValue(pair.primaryStartPx + pixelDelta, pair.parentSizeAtStart, operation.handleSize || 0, pair.primaryElement);
			if(splitSnapResult && splitSnapResult.snapped) {
				pixelDelta = splitSnapResult.pixelValue - pair.primaryStartPx;
				operation.snapResult = splitSnapResult;
			}
		}

		var minPx = Math.max(pair.minPx || 0, 0);
		var maxPrimaryPx = pair.pairStartPx - minPx;

		if(pair.maxPx !== null && pair.maxPx > 0) {
			maxPrimaryPx = Math.min(maxPrimaryPx, pair.maxPx);
		}

		if(maxPrimaryPx < minPx) {
			minPx = Math.max(pair.pairStartPx / 2, 0);
			maxPrimaryPx = minPx;
		}

		var requestedPrimaryPx = pair.primaryStartPx + pixelDelta;
		var primaryPx = self.applyConstraints(requestedPrimaryPx, minPx, maxPrimaryPx);
		var secondaryPx = pair.pairStartPx - primaryPx;
		var clampedDelta = primaryPx - pair.primaryStartPx;

		pair.currentPrimaryPx = primaryPx;
		pair.currentSecondaryPx = secondaryPx;
		pair.lastClampedDelta = clampedDelta;

		var parentSize = pair.parentSizeAtStart || operation.parentSizeAtStart;
		var primaryValue = formatSplitPairValue(primaryPx, pair.primaryElement, parentSize);
		var secondaryValue = formatSplitPairValue(secondaryPx, pair.secondaryElement, parentSize);

		pair.currentPrimaryValue = primaryValue;
		pair.currentSecondaryValue = secondaryValue;

		if(self.splitPairSave !== "end") {
			self.wiki.setText(pair.primaryTiddler, pair.primaryField || "text", null, primaryValue);
			self.wiki.setText(pair.secondaryTiddler, pair.secondaryField || "text", null, secondaryValue);
		}

		if(self.splitPairLiveResize === "yes" || self.liveResize === "yes") {
			pair.primaryElement.style[self.targetProperty] = primaryValue;
			pair.secondaryElement.style[self.targetProperty] = secondaryValue;

			// For flex layouts, width/height alone may not be enough.
			// flexBasis makes horizontal and vertical split-pair resizing much more stable.
			if(pair.primaryElement.style) {
				pair.primaryElement.style.flexBasis = primaryValue;
			}
			if(pair.secondaryElement.style) {
				pair.secondaryElement.style.flexBasis = secondaryValue;
			}
			self.publishCSSVariable(primaryValue, pair.primaryElement, self.leftCssVariable || self.topCssVariable || self.cssVariable);
			self.publishCSSVariable(secondaryValue, pair.secondaryElement, self.rightCssVariable || self.bottomCssVariable || self.cssVariableSecondary);
		}

		if(self.actions) {
			setSplitPairActionVariables(operation, pixelDelta, "actions");
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-property", self.targetProperty);
			self.setVariable("tv-action-handle-size", operation.handleSize.toString());
			self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
			self.invokeActionString(self.actions, self);
		}
	};

	var commitSplitPairValues = function(operation) {
		if(!operation || !operation.splitPair || self.splitPairSave !== "end") {
			return;
		}

		var pair = operation.splitPair;

		if(pair.currentPrimaryValue !== undefined && pair.currentPrimaryValue !== null) {
			self.wiki.setText(pair.primaryTiddler, pair.primaryField || "text", null, pair.currentPrimaryValue);
		}

		if(pair.currentSecondaryValue !== undefined && pair.currentSecondaryValue !== null) {
			self.wiki.setText(pair.secondaryTiddler, pair.secondaryField || "text", null, pair.currentSecondaryValue);
		}
	};

	// Helper to update the tiddler values based on drag delta (in pixels)
	var updateValues = function(pixelDelta, operation) {
		if(self.resizeMode === "split-pair" && operation.splitPair) {
			updateSplitPairValues(pixelDelta, operation);
			return;
		}
		// Get fresh measurements for accurate calc() evaluation
		// This ensures that if parent size or handle size changes during resize, we use current values
		var measureElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
		var currentParentSize = getParentSize(measureElement);
		var currentHandleSize = getHandleSize();
		
		// Always re-evaluate min/max values to get the latest from self.minValueRaw and self.maxValueRaw
		// This ensures that if attributes change during resize, the new values are used immediately
		// Use fresh measurements instead of cached values from operation
		var effectiveMinValue = self.minValueRaw ? self.evaluateCSSValue(self.minValueRaw, currentParentSize, currentHandleSize) : null;
		var effectiveMaxValue = self.maxValueRaw ? self.evaluateCSSValue(self.maxValueRaw, currentParentSize, currentHandleSize) : null;
		
		// Ensure min/max values are reasonable
		if(effectiveMinValue !== null) {
			effectiveMinValue = Math.max(effectiveMinValue, 0);
		}
		if(effectiveMaxValue !== null && effectiveMaxValue < 0) {
			// If max value calculated to negative (can happen with concurrent resize), 
			// use parent size as a reasonable maximum
			effectiveMaxValue = operation.parentSizeAtStart * 0.8;
		}
		
		// Pre-calculate clamped delta based on min/max constraints
		var clampedDelta = pixelDelta;
		
		// Check constraints for all tiddlers and clamp delta accordingly
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(operation.startValues[tiddlerTitle] !== undefined) {
					var newPixelValue = operation.startValues[tiddlerTitle] + pixelDelta;
					// Ensure minimum value is respected (never less than absolute minimum)
					var absoluteMin = Math.max(effectiveMinValue || 0, 0);
					if(newPixelValue < absoluteMin) {
						// Calculate the maximum negative delta that won't go below min
						var maxNegativeDelta = absoluteMin - operation.startValues[tiddlerTitle];
						clampedDelta = Math.max(clampedDelta, maxNegativeDelta);
					}
					if(effectiveMaxValue !== null && effectiveMaxValue > 0 && newPixelValue > effectiveMaxValue) {
						// Calculate the maximum positive delta that won't exceed max
						var maxPositiveDelta = effectiveMaxValue - operation.startValues[tiddlerTitle];
						clampedDelta = Math.min(clampedDelta, maxPositiveDelta);
					}
				}
			});
		} else if(self.targetTiddler) {
			var newPixelValue = operation.startValue + pixelDelta;
			var absoluteMin = Math.max(effectiveMinValue || 0, 0);
			if(newPixelValue < absoluteMin) {
				clampedDelta = absoluteMin - operation.startValue;
			}
			if(effectiveMaxValue !== null && effectiveMaxValue > 0 && newPixelValue > effectiveMaxValue) {
				clampedDelta = effectiveMaxValue - operation.startValue;
			}
		}
		
		// Optional snap points. They are applied after min/max clamping so snap
		// cannot violate hard constraints. Disabled unless snap="..." is supplied.
		if(self.snap) {
			var snapStartValue = operation.startValue;
			if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
				snapStartValue = operation.startValues[self.targetTiddlers[0]];
			}
			var snapReferenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var snapResult = self.applySnapToPixelValue(snapStartValue + clampedDelta, getParentSize(snapReferenceElement), currentHandleSize, snapReferenceElement);
			if(snapResult && snapResult.snapped) {
				clampedDelta = snapResult.pixelValue - snapStartValue;
				operation.snapResult = snapResult;
			} else {
				operation.snapResult = snapResult;
			}
		}
		operation.lastClampedDelta = clampedDelta;

		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(operation.startValues[tiddlerTitle] !== undefined && operation.startUnits[tiddlerTitle]) {
					var newPixelValue = operation.startValues[tiddlerTitle] + clampedDelta;
					var originalUnit = operation.startUnits[tiddlerTitle];
					
					// Convert back to the original unit
					// Use the first target element for percentage calculations if available
					var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
					var convertedValue = self.convertFromPixels(newPixelValue, originalUnit, getParentSize(referenceElement), referenceElement);
					
					// Ensure the converted value never goes below the minimum
					if(operation.effectiveMinValue !== null) {
						var minInOriginalUnit = self.convertFromPixels(Math.max(operation.effectiveMinValue, 0), originalUnit, getParentSize(referenceElement), referenceElement);
						convertedValue = Math.max(convertedValue, minInOriginalUnit);
					}
					
					// Format the value based on the original unit type
					var formattedValue = self.formatValueWithUnit(convertedValue, originalUnit);
					
					self.wiki.setText(tiddlerTitle, self.targetField || "text", null, formattedValue);
				}
			});
		} else if(self.targetTiddler) {
			// Fallback to single tiddler for backwards compatibility
			var newPixelValue = operation.startValue + clampedDelta;
			
			// Use widget's unit for single tiddler mode
			// Use the first target element for percentage calculations if available
			var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var convertedValue = self.convertFromPixels(newPixelValue, self.unit, getParentSize(referenceElement), referenceElement);
			
			// Ensure the converted value never goes below the minimum
			if(operation.effectiveMinValue !== null) {
				var minInOriginalUnit = self.convertFromPixels(Math.max(operation.effectiveMinValue, 0), self.unit, getParentSize(referenceElement), referenceElement);
				convertedValue = Math.max(convertedValue, minInOriginalUnit);
			}
			
			// Format the value based on the unit type
			var formattedValue = self.formatValueWithUnit(convertedValue);
			
			self.wiki.setText(self.targetTiddler, self.targetField || "text", null, formattedValue);
		}
		
		// Publish CSS variables after value calculation. This does not replace the
		// legacy tiddler write or live style path.
		if(self.cssVariable) {
			var cssReferenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var cssPixelValue = operation.startValue + clampedDelta;
			if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
				cssPixelValue = operation.startValues[self.targetTiddlers[0]] + clampedDelta;
			}
			var cssConvertedValue = self.convertFromPixels(cssPixelValue, self.unit, getParentSize(cssReferenceElement), cssReferenceElement);
			var cssFormattedValue = self.formatValueWithUnit(cssConvertedValue, self.unit);
			self.publishCSSVariable(cssFormattedValue, cssReferenceElement);
		}

		// Call action string if provided
		if(self.actions) {
			// Use the first tiddler's value for the action
			var actionPixelValue = operation.startValue + clampedDelta;
			if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
				actionPixelValue = operation.startValues[self.targetTiddlers[0]] + clampedDelta;
			}
			
			// Convert to widget's unit for the action
			var actionValue = self.convertFromPixels(
				actionPixelValue,
				self.unit,
				operation.parentSizeAtStart,
				operation.targetElement || domNode
			);

			var formattedValue = self.formatValueWithUnit(actionValue, self.unit);

			var actionPercentOfParent = operation.parentSizeAtStart > 0
				? (actionPixelValue * 100) / operation.parentSizeAtStart
				: 0;

			var actionDeltaPercentOfParent = operation.parentSizeAtStart > 0
				? (clampedDelta * 100) / operation.parentSizeAtStart
				: 0;

			self.setVariable("tv-action-value-percent-of-parent", actionPercentOfParent.toString());
			self.setVariable("tv-action-formatted-value-percent-of-parent", self.formatValueWithUnit(actionPercentOfParent, "%"));
			self.setVariable("tv-action-delta-pixels", clampedDelta.toString());
			self.setVariable("tv-action-delta-percent-of-parent", actionDeltaPercentOfParent.toString());
			self.setVariable("tv-action-formatted-delta-percent-of-parent", self.formatValueWithUnit(actionDeltaPercentOfParent, "%"));
			// Set variables for the action string
			self.setVariable("tv-action-value", actionValue.toString());
			self.setVariable("tv-action-value-pixels", actionPixelValue.toString());
			self.setVariable("tv-action-formatted-value", formattedValue);
			self.setVariable("tv-action-handle-size", operation.handleSize.toString());
			self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
			self.invokeActionString(self.actions, self);
		}
	};
	
	// Create a resize operation object for a specific pointer (optimized for memory)
	var createResizeOperation = function(pointerId) {
		return {
			pointerId: pointerId,
			isResizing: true,
			timestamp: Date.now(), // Add timestamp for stale detection
			startX: 0,
			startY: 0,
			startValue: 0,
			startValues: null, // Initialize as null, create object only when needed
			startUnits: null, // Initialize as null, create object only when needed
			targetElements: null, // Initialize as null, create array only when needed
			parentSizeAtStart: 0,
			parentKey: null,
			effectiveMinValue: null,
			effectiveMaxValue: null,
			animationFrameId: null,
			pendingMouseEvent: null,
			hasPointerCapture: false,
			cursor: null,
			pointerToResizeBoundaryOffset: null,
			resizeFixedEdgeAtStart: null,
			resizeBoundaryAtStart: null,
			snapResult: null,
			lastClampedDelta: 0,
			hasDragged: false,
			tapMovementThreshold: 5
		};
	};
	
	var handlePointerDown = function(event) {
		if((self.resizeMode === "grid-track" || self.mode === "grid-track") && self.executeGridTrackMode) {
			self.executeGridTrackMode(domNode, event);
			return;
		}

		// For touch events, we need to ensure we're handling the primary touch
		// and prevent default browser touch behaviors immediately
		if(event.pointerType === "touch") {
			// Prevent browser touch gestures (like pull-to-refresh, swipe navigation)
			event.preventDefault();
			event.stopPropagation();
			// Also prevent the default touch behavior on the target
			if(event.target) {
				event.target.style.touchAction = "none";
			}
			// Trigger haptic feedback on touch start
			if(self.hapticFeedback === "yes") {
				self.triggerHaptic(10); // Slightly longer pulse for better feel
			}
		} else {
			event.preventDefault();
			event.stopPropagation();
		}
		
		// Create a new resize operation for this pointer
		var operation = createResizeOperation(event.pointerId);
		self.activeResizeOperations[event.pointerId] = operation;
		
		// Set a timeout to clean up stale operations (30 seconds)
		if(self.operationTimeouts[event.pointerId]) {
			clearTimeout(self.operationTimeouts[event.pointerId]);
		}
		self.operationTimeouts[event.pointerId] = setTimeout(function() {
			if(self.activeResizeOperations[event.pointerId] && 
			   self.activeResizeOperations[event.pointerId].isResizing) {
				console.warn("Cleaning up stale resize operation for pointer", event.pointerId);
				self.cleanupResize(event.pointerId);
			}
			delete self.operationTimeouts[event.pointerId];
		}, 30000);
		
		// Store pointer type for debugging
		operation.pointerType = event.pointerType || "mouse";
		
		// Store the actual initial mouse position
		operation.initialMouseX = event.clientX;
		operation.initialMouseY = event.clientY;
		
		// Store the raw pointer start position for backwards-compatible delta values.
		// The exact handle grab offset is calculated later after the target
		// element and operation.startValue are known.
		operation.startX = event.clientX;
		operation.startY = event.clientY;
		
		// Calculate handle size early
		var handleSize = getHandleSize();
		operation.handleSize = handleSize;
		
		// We'll set up parent size cache after finding target elements
		
		// Find the target element(s) to resize FIRST so we can measure them
		operation.targetElements = self.getTargetElements(domNode);
		operation.targetElement = operation.targetElements[0]; // Keep for backward compatibility
		
		// Now that we have target elements, set up parent size cache
		// Use the target element's parent for percentage calculations
		var measureElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
		var parentElement = measureElement.parentElement;
		if(parentElement) {
			// Create a unique key for this parent element
			var parentKey = parentElement.className || "default";
			if(parentElement.id) {
				parentKey = parentElement.id + "-" + parentKey;
			}
			
			// Check if we already have a cached size for this parent from another active resize
			var hasActiveResizeOnSameParent = false;
			for(var activeId in self.activeResizeOperations) {
				var activeOp = self.activeResizeOperations[activeId];
				if(activeOp && activeOp.isResizing && activeOp.parentKey === parentKey) {
					hasActiveResizeOnSameParent = true;
					break;
				}
			}
			
			// If there's already an active resize on the same parent, use the cached size
			// Otherwise, measure and cache it
			if(hasActiveResizeOnSameParent && self.parentSizeCache[parentKey]) {
				operation.parentSizeAtStart = self.parentSizeCache[parentKey];
			} else {
				operation.parentSizeAtStart = getParentSize(measureElement);
				updateParentSizeCache(parentKey, operation.parentSizeAtStart);
			}
			operation.parentKey = parentKey;
		} else {
			// Fallback if no parent element
			operation.parentSizeAtStart = getParentSize(domNode);
		}
		
		// Note: We no longer cache min/max values at drag start
		// They are now evaluated fresh on each update to respect attribute changes during resize
		
		// Get and store the current value for each tiddler
		operation.startValues = {}; // Create object when needed
		operation.startUnits = {}; // Create object when needed
		
		// Helper to get the actual computed size of an element.
		// If visiblePortion="yes", this returns the visible portion of the target
		// element's own border box after intersecting it with the viewport and all
		// clipping ancestors.
		//
		// Important:
		// - This deliberately does not union descendant rectangles.
		// - It must not include the resizer handle, handle grip, sidebar content,
		//   or overflowing children.
		// - The returned size is relative to the target element itself.
		var getElementSize = function(element) {
			if(!element) {
				return null;
			}

			var viewportClipRect = function() {
				var docEl = self.document.documentElement;
				var body = self.document.body;
				var width = self.document.defaultView && self.document.defaultView.innerWidth
					? self.document.defaultView.innerWidth
					: (docEl.clientWidth || body.clientWidth || 0);
				var height = self.document.defaultView && self.document.defaultView.innerHeight
					? self.document.defaultView.innerHeight
					: (docEl.clientHeight || body.clientHeight || 0);

				return {
					left: 0,
					top: 0,
					right: width,
					bottom: height
				};
			};

			var normalizeRect = function(rect) {
				return {
					left: rect.left,
					top: rect.top,
					right: rect.right,
					bottom: rect.bottom
				};
			};

			var rectWidth = function(rect) {
				return Math.max(0, rect.right - rect.left);
			};

			var rectHeight = function(rect) {
				return Math.max(0, rect.bottom - rect.top);
			};

			var intersectRects = function(a, b) {
				var result = {
					left: Math.max(a.left, b.left),
					top: Math.max(a.top, b.top),
					right: Math.min(a.right, b.right),
					bottom: Math.min(a.bottom, b.bottom)
				};

				if(result.right <= result.left || result.bottom <= result.top) {
					return null;
				}

				return result;
			};

			var overflowClips = function(value) {
				return value === "hidden" ||
					value === "clip" ||
					value === "auto" ||
					value === "scroll";
			};

			var getElementClientClipRect = function(clipElement) {
				var rect = clipElement.getBoundingClientRect();

				// clientLeft/clientTop remove the border from the clipping box.
				// clientWidth/clientHeight represent the inner visible box.
				var left = rect.left + (clipElement.clientLeft || 0);
				var top = rect.top + (clipElement.clientTop || 0);
				var width = clipElement.clientWidth || Math.max(0, rect.width);
				var height = clipElement.clientHeight || Math.max(0, rect.height);

				return {
					left: left,
					top: top,
					right: left + width,
					bottom: top + height
				};
			};

			var getVisibleRect = function(targetElement) {
				// Start with the target element's own border box only.
				// Do not include descendants; descendants can include the resizer handle
				// or overflowing sidebar content and would corrupt the measured width.
				var visibleRect = normalizeRect(targetElement.getBoundingClientRect());
				var clipRect = viewportClipRect();

				visibleRect = intersectRects(visibleRect, clipRect);
				if(!visibleRect) {
					return null;
				}

				// Walk from the element itself upward. Including the element itself is
				// useful if the target has overflow:hidden/auto/scroll/clip.
				var current = targetElement;

				while(current && current.nodeType === 1 && current !== self.document.body.parentElement) {
					var style;

					try {
						style = self.document.defaultView.getComputedStyle(current);
					} catch(e) {
						style = null;
					}

					if(style) {
						var clipsX = overflowClips(style.overflowX);
						var clipsY = overflowClips(style.overflowY);
						var clipsShorthand = overflowClips(style.overflow);

						if(clipsX || clipsY || clipsShorthand) {
							var elementClipRect = getElementClientClipRect(current);
							visibleRect = intersectRects(visibleRect, elementClipRect);

							if(!visibleRect) {
								return null;
							}
						}
					}

					current = current.parentElement;
				}

				return visibleRect;
			};

			var rect;

			if(self.visiblePortion === "yes") {
				rect = getVisibleRect(element);

				if(!rect) {
					return 0;
				}

				return self.direction === "horizontal"
					? rectWidth(rect)
					: rectHeight(rect);
			}

			rect = element.getBoundingClientRect();
			return self.direction === "horizontal" ? rect.width : rect.height;
		};
		
		// If we have a target element, measure its actual size
		var measuredSize = null;
		if(operation.targetElement) {
			measuredSize = getElementSize(operation.targetElement);
		}
		
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle, index) {
				// If we have a measured size from the actual element, use that for the first tiddler
				// This ensures we're starting from the actual rendered size, not the stored value
				if(index === 0 && measuredSize !== null) {
					operation.startValues[tiddlerTitle] = measuredSize;
					// Detect the unit from the tiddler value for later conversion
					var storedValue = self.getTiddlerValue(tiddlerTitle);
					operation.startUnits[tiddlerTitle] = self.getUnit(storedValue);
				} else {
					// For other tiddlers or if no element to measure, fall back to stored value
					var currentValue = self.getTiddlerValue(tiddlerTitle);
					
					// Check if it's a calc() expression
					if(currentValue.startsWith("calc(") && currentValue.endsWith(")")) {
						// For calc expressions, we can't easily determine the unit, so default to px
						operation.startUnits[tiddlerTitle] = "px";
						// Evaluate the calc expression
						var pixelValue = self.evaluateCSSValue(currentValue, operation.parentSizeAtStart, handleSize);
						operation.startValues[tiddlerTitle] = pixelValue;
					} else {
						// Get the numeric value and unit
						var numericValue = getNumericValue(currentValue);
						var valueUnit = self.getUnit(currentValue);
						
						// Store the original unit for this tiddler
						operation.startUnits[tiddlerTitle] = valueUnit;
						
						// Convert to pixels for internal calculations
						var pixelValue = self.convertToPixels(
							numericValue,
							valueUnit,
							operation.parentSizeAtStart,
							operation.targetElement || domNode
						);
						operation.startValues[tiddlerTitle] = pixelValue;
					}
				}
			});
			// For backwards compatibility, set startValue to the first tiddler's value
			operation.startValue = operation.startValues[self.targetTiddlers[0]] || 0;
		} else if(self.targetTiddler) {
			// Fallback to single tiddler for backwards compatibility
			if(measuredSize !== null) {
				// Use the measured size from the actual element
				operation.startValue = measuredSize;
				// Get the unit from the stored value
				var storedValue = self.getTiddlerValue(self.targetTiddler);
				// For calc expressions, default to px unit
				if(storedValue.startsWith("calc(") && storedValue.endsWith(")")) {
					self.unit = "px";
				} else {
					self.unit = self.getUnit(storedValue);
				}
			} else {
				// No element to measure, fall back to stored value
				var currentValue = self.getTiddlerValue(self.targetTiddler);
				
				// Check if it's a calc() expression
				if(currentValue.startsWith("calc(") && currentValue.endsWith(")")) {
					// For calc expressions, we can't easily determine the unit, so default to px
					self.unit = "px";
					// Evaluate the calc expression
					operation.startValue = self.evaluateCSSValue(currentValue, operation.parentSizeAtStart, handleSize);
				} else {
					// Get the numeric value and unit
					var numericValue = getNumericValue(currentValue);
					var valueUnit = self.getUnit(currentValue);
					self.unit = valueUnit;
					
					// Convert to pixels for internal calculations
					operation.startValue = self.convertToPixels(
						numericValue,
						valueUnit,
						operation.parentSizeAtStart,
						operation.targetElement || domNode
					);
				}
			}
		} else {
			// No tiddler specified, try to measure element or use default
			if(measuredSize !== null) {
				operation.startValue = measuredSize;
			} else {
				// Evaluate the default value which might be a calc() expression
				operation.startValue = self.evaluateCSSValue(self.defaultValue || "200px", operation.parentSizeAtStart, handleSize);
			}
		}
		
		// Set up coupled adjacent-pane resizing after the generic start value
		// detection, so the split-pair mode can override operation.startValue
		// without removing any of the legacy logic above.
		setupSplitPairOperation(operation);

		// Now that operation.targetElement and operation.startValue are final,
		// capture the exact pointer offset from the moving resize boundary.
		// This keeps the handle anchored to the point where it was grabbed.
		setupHandleGrabOffset(event, operation);
		
		// Add active class
		domNode.classList.add("tc-resizer-active");
		
		// Add resizing class to body to disable transitions
		self.document.body.classList.add("tc-resizing");
		
		// Prevent touch scrolling during resize
		self.document.body.style.touchAction = "none";
		
		// Call onBeforeResizeStart callback first
		if(self.onBeforeResizeStart) {
			// Convert pixel value to the widget's unit
			var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var convertedValue = self.convertFromPixels(operation.startValue, self.unit, getParentSize(referenceElement), referenceElement);
			var formattedValue = self.formatValueWithUnit(convertedValue, self.unit);
			
			// Set variables for the action string
			self.setVariable("tv-action-value", convertedValue.toString());
			self.setVariable("tv-action-value-pixels", operation.startValue.toString());
			self.setVariable("tv-action-formatted-value", formattedValue);
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-property", self.targetProperty);
			self.setVariable("tv-action-handle-size", handleSize.toString());
			self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
			if(operation.splitPair) {
				setSplitPairActionVariables(operation, 0, "before-resize-start");
			}
			self.invokeActionString(self.onBeforeResizeStart, self);
		}
		
		// Call resize start callback
		if(self.onResizeStart) {
			// Convert pixel value to the widget's unit
			var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var convertedValue = self.convertFromPixels(operation.startValue, self.unit, getParentSize(referenceElement), referenceElement);
			var formattedValue = self.formatValueWithUnit(convertedValue, self.unit);
			
			// Set variables for the action string
			self.setVariable("tv-action-value", convertedValue.toString());
			self.setVariable("tv-action-value-pixels", operation.startValue.toString());
			self.setVariable("tv-action-formatted-value", formattedValue);
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-property", self.targetProperty);
			self.setVariable("tv-action-handle-size", handleSize.toString());
			self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
			if(operation.splitPair) {
				setSplitPairActionVariables(operation, 0, "resize-start");
			}
			self.invokeActionString(self.onResizeStart, self);
		}
		
		// Capture the pointer to ensure consistent touch behavior
		// This prevents the browser from interpreting touch gestures as scrolling
		if(domNode.setPointerCapture) {
			try {
				domNode.setPointerCapture(event.pointerId);
				// Track that we have pointer capture for this operation
				operation.hasPointerCapture = true;
			} catch(e) {
				// Fallback if setPointerCapture fails
				console.warn("Failed to capture pointer:", e);
				operation.hasPointerCapture = false;
				
				// For touch devices, if pointer capture fails, we need to ensure
				// touch events are still properly handled
				if(event.pointerType === "touch") {
					// Add passive:false to ensure preventDefault works
					var touchMoveHandler = function(e) {
						e.preventDefault();
						// Convert touch event to pointer-like event
						var touch = e.changedTouches[0];
						if(touch) {
							handlePointerMove({
								pointerId: event.pointerId,
								clientX: touch.clientX,
								clientY: touch.clientY,
								preventDefault: function() {}
							});
						}
					};
					var touchEndHandler = function(e) {
						e.preventDefault();
						self.document.removeEventListener("touchmove", touchMoveHandler, {passive: false});
						self.document.removeEventListener("touchend", touchEndHandler, {passive: false});
						self.document.removeEventListener("touchcancel", touchEndHandler, {passive: false});
						handlePointerUp({pointerId: event.pointerId});
					};
					
					// Store handlers for cleanup
					operation.touchMoveHandler = touchMoveHandler;
					operation.touchEndHandler = touchEndHandler;
					
					self.document.addEventListener("touchmove", touchMoveHandler, {passive: false});
					self.document.addEventListener("touchend", touchEndHandler, {passive: false});
					self.document.addEventListener("touchcancel", touchEndHandler, {passive: false});
				}
			}
		}
		
		// Prevent text selection
		self.document.body.style.userSelect = "none";
		
		// Get the cursor from the resizer element's computed style
		var computedStyle = self.document.defaultView.getComputedStyle(domNode);
		var resizerCursor = computedStyle.cursor;
		
		// Store the cursor in the operation
		if(resizerCursor && (resizerCursor.indexOf("resize") !== -1 || resizerCursor === "move" || resizerCursor === "grab")) {
			operation.cursor = resizerCursor;
		} else {
			// Fallback to direction-based cursor
			operation.cursor = self.direction === "horizontal" ? "ew-resize" : "ns-resize";
		}
		
		// Set cursor on body
		self.document.body.style.cursor = operation.cursor;
		
	};
	
	// Global handler for pointer move (called by GlobalResizerManager)
	self.handlePointerMoveGlobal = function(event) {
		// Defensive null check - widget might be destroyed
		if(!self || !self.activeResizeOperations) return;
		
		// Get the operation for this pointer
		var operation = self.activeResizeOperations[event.pointerId];
		if(!operation || !operation.isResizing) return;
		
		// Prevent default to stop any scrolling behavior
		event.preventDefault();
		
		// Check if pointer is outside the viewport
		if(event.clientX < 0 || event.clientY < 0 ||
		   event.clientX > self.document.documentElement.clientWidth ||
		   event.clientY > self.document.documentElement.clientHeight) {
			// Pointer is outside viewport, stop the resize
			self.cleanupResize(event.pointerId);
			return;
		}
		
		// Store the event for processing
		operation.pendingMouseEvent = event;
		
		// Use requestAnimationFrame for smooth updates
		if(!operation.animationFrameId) {
			operation.animationFrameId = requestAnimationFrame(function() {
				operation.animationFrameId = null;
				
				if(!operation.pendingMouseEvent || !operation.isResizing) return;
				
				var deltaX = operation.pendingMouseEvent.clientX - operation.startX;
				var deltaY = operation.pendingMouseEvent.clientY - operation.startY;

				if(Math.max(Math.abs(deltaX), Math.abs(deltaY)) > (operation.tapMovementThreshold || 5)) {
					operation.hasDragged = true;
				}
				
				// Calculate pixel delta based on direction and invert setting
				var pixelDelta;
				if(self.direction === "horizontal") {
					pixelDelta = self.invertDirection === "yes" ? -deltaX : deltaX;
				} else {
					pixelDelta = self.invertDirection === "yes" ? -deltaY : deltaY;
				}

				// Correct the delta for the exact point inside the handle where the
				// pointer was pressed. This prevents jumps/drift when the handle has
				// thickness or when visiblePortion changes the measured start size.
				var handleGrabOffsetPixelDelta = getHandleGrabOffsetPixelDelta(operation.pendingMouseEvent, operation);
				if(handleGrabOffsetPixelDelta !== null) {
					pixelDelta = handleGrabOffsetPixelDelta;
				}
				
				// Update all values based on the pixel delta
				updateValues(pixelDelta, operation);
				
				// Call resize callback
				if(self.onResize) {
					// Use the first tiddler's value for the callback
					var effectivePixelDelta = operation.lastClampedDelta !== undefined ? operation.lastClampedDelta : pixelDelta;
					var callbackPixelValue = operation.startValue + effectivePixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						callbackPixelValue = operation.startValues[self.targetTiddlers[0]] + effectivePixelDelta;
					}
					
					// Convert to widget's unit for the callback
					var callbackValue = self.convertFromPixels(
						callbackPixelValue,
						self.unit,
						operation.parentSizeAtStart,
						operation.targetElement || domNode
					);

					var formattedValue = self.formatValueWithUnit(callbackValue, self.unit);
					
					var callbackPercentOfParent = operation.parentSizeAtStart > 0
						? (callbackPixelValue * 100) / operation.parentSizeAtStart
						: 0;

					var deltaPixels = effectivePixelDelta;
					var deltaPercentOfParent = operation.parentSizeAtStart > 0
						? (deltaPixels * 100) / operation.parentSizeAtStart
						: 0;

					// Set variables for the action string
					self.setVariable("tv-action-value", callbackValue.toString());
					self.setVariable("tv-action-value-pixels", callbackPixelValue.toString());
					self.setVariable("tv-action-formatted-value", formattedValue);
					self.setVariable("tv-action-direction", self.direction);
					self.setVariable("tv-action-property", self.targetProperty);
					self.setVariable("tv-action-delta-x", deltaX.toString());
					self.setVariable("tv-action-delta-y", deltaY.toString());
					self.setVariable("tv-action-handle-size", operation.handleSize.toString());
					self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
					self.setVariable("tv-action-value-percent-of-parent", callbackPercentOfParent.toString());
					self.setVariable("tv-action-formatted-value-percent-of-parent", self.formatValueWithUnit(callbackPercentOfParent, "%"));
					self.setVariable("tv-action-delta-pixels", deltaPixels.toString());
					self.setVariable("tv-action-delta-percent-of-parent", deltaPercentOfParent.toString());
					self.setVariable("tv-action-formatted-delta-percent-of-parent", self.formatValueWithUnit(deltaPercentOfParent, "%"));
					self.setVariable("tv-action-snapped", operation.snapResult && operation.snapResult.snapped ? "yes" : "no");
					self.setVariable("tv-action-snap-value", operation.snapResult && operation.snapResult.formattedValue ? operation.snapResult.formattedValue : "");
					if(operation.splitPair) {
						setSplitPairActionVariables(operation, pixelDelta, "resize");
					}
					self.invokeActionString(self.onResize, self);
				}
				
				// Optionally update the target element(s) directly for immediate feedback
				if(self.liveResize === "yes" && operation.targetElements.length > 0 && !(self.resizeMode === "split-pair" && operation.splitPair)) {
					// For live resize of DOM elements, we'll use the first tiddler's value as reference
					var liveEffectiveDelta = operation.lastClampedDelta !== undefined ? operation.lastClampedDelta : pixelDelta;
					var livePixelValue = operation.startValue + liveEffectiveDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						livePixelValue = operation.startValues[self.targetTiddlers[0]] + liveEffectiveDelta;
					}
					
					// visiblePortion affects the measured start value only. Do not scale
					// live resize deltas here; doing so makes the handle drift because it
					// mixes viewport clipping with pointer-boundary math.

					// Apply min/max constraints to the pixel value
					// Get fresh measurements for accurate constraint evaluation
					var measureElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
					var currentParentSize = getParentSize(measureElement);
					var currentHandleSize = getHandleSize();
					
					// Re-evaluate min/max to use current attribute values with fresh measurements
					var currentMinValue = self.minValueRaw ? self.evaluateCSSValue(self.minValueRaw, currentParentSize, currentHandleSize) : null;
					var currentMaxValue = self.maxValueRaw ? self.evaluateCSSValue(self.maxValueRaw, currentParentSize, currentHandleSize) : null;
					
					var absoluteMin = Math.max(currentMinValue || 0, 0);
					if(livePixelValue < absoluteMin) {
						livePixelValue = absoluteMin;
					}
					if(currentMaxValue !== null && currentMaxValue > 0 && livePixelValue > currentMaxValue) {
						livePixelValue = currentMaxValue;
					}
					
					// Convert to widget's unit for live resize
					var liveValue = self.convertFromPixels(livePixelValue, self.unit, getParentSize(domNode), domNode);
					
					$tw.utils.each(operation.targetElements, function(element) {
						if(element) {
							element.style[self.targetProperty] = liveValue + (self.unit || "px");
							
							// Apply aspect ratio constraints
							if(aspectRatioValue && (self.targetProperty === "width" || self.targetProperty === "height")) {
								var secondaryProperty, secondaryValue;
								if(self.targetProperty === "width") {
									secondaryProperty = "height";
									secondaryValue = liveValue / aspectRatioValue;
								} else {
									secondaryProperty = "width";
									secondaryValue = liveValue * aspectRatioValue;
								}
								element.style[secondaryProperty] = secondaryValue + (self.unit || "px");
							}
						}
					});
				}
			});
		}
	};
	
	// Cleanup function to stop resize operation for a specific pointer
	self.cleanupResize = function(pointerId) {
		// Defensive null check
		if(!self || !self.activeResizeOperations) return;
		
		var operation = self.activeResizeOperations[pointerId];
		if(!operation || !operation.isResizing) return;
		
		operation.isResizing = false;
		
		// Clean up touch event handlers if they exist
		if(operation.touchMoveHandler && operation.touchEndHandler) {
			self.document.removeEventListener("touchmove", operation.touchMoveHandler, {passive: false});
			self.document.removeEventListener("touchend", operation.touchEndHandler, {passive: false});
			self.document.removeEventListener("touchcancel", operation.touchEndHandler, {passive: false});
			operation.touchMoveHandler = null;
			operation.touchEndHandler = null;
		}
		
		// Check if this was the last active resize operation and get the cursor from remaining operations
		var hasActiveOperations = false;
		var remainingCursor = null;
		for(var id in self.activeResizeOperations) {
			if(self.activeResizeOperations[id].isResizing) {
				hasActiveOperations = true;
				// Use the cursor from one of the remaining operations
				if(!remainingCursor && self.activeResizeOperations[id].cursor) {
					remainingCursor = self.activeResizeOperations[id].cursor;
				}
			}
		}
		
		// Only remove active class if no operations are active
		if(!hasActiveOperations) {
			domNode.classList.remove("tc-resizer-active");
		}
		
		// Clean up parent size cache if no operations are using it
		if(operation.parentKey) {
			var parentKeyStillInUse = false;
			for(var id in self.activeResizeOperations) {
				if(id !== pointerId && self.activeResizeOperations[id].isResizing && 
				   self.activeResizeOperations[id].parentKey === operation.parentKey) {
					parentKeyStillInUse = true;
					break;
				}
			}
			if(!parentKeyStillInUse) {
				delete self.parentSizeCache[operation.parentKey];
			}
		}
		
		// Cancel any pending animation frame
		if(operation.animationFrameId) {
			cancelAnimationFrame(operation.animationFrameId);
			operation.animationFrameId = null;
		}
		
		// Remove resizing class from body only if no operations are active
		if(!hasActiveOperations) {
			self.document.body.classList.remove("tc-resizing");
		}
		
		// Release pointer capture if we had it
		if(operation.hasPointerCapture && self.domNode && self.domNode.releasePointerCapture) {
			try {
				self.domNode.releasePointerCapture(pointerId);
				operation.hasPointerCapture = false;
			} catch(e) {
				// Ignore errors when releasing capture
			}
		}
		
		// Clear any cleanup timeout for this operation
		if(self.operationTimeouts[pointerId]) {
			clearTimeout(self.operationTimeouts[pointerId]);
			delete self.operationTimeouts[pointerId];
		}
		
		// Remove the operation from our tracking
		delete self.activeResizeOperations[pointerId];
		
		// Restore cursor and selection only if no operations are active
		if(!hasActiveOperations) {
			self.document.body.style.userSelect = "";
			self.document.body.style.cursor = "";
			self.document.body.style.touchAction = "";
		} else if(remainingCursor) {
			// If there are still active operations, use the cursor from one of them
			self.document.body.style.cursor = remainingCursor;
		}
	};
	
	// Global handler for pointer up (called by GlobalResizerManager)
	self.handlePointerUpGlobal = function(event) {
		// Defensive null check - widget might be destroyed
		if(!self || !self.activeResizeOperations) return;
		
		var operation = self.activeResizeOperations[event.pointerId];
		if(!operation || !operation.isResizing) return;
		
		// Trigger haptic feedback on release for touch
		if(operation.pointerType === "touch" && self.hapticFeedback === "yes") {
			self.triggerHaptic(5); // Short pulse for release
		}

		commitSplitPairValues(operation);
		
		self.cleanupResize(event.pointerId);
		
		// Call resize end callback
		if(self.onResizeEnd) {
			// Get final value from tiddler or current state
			var finalValue = operation.startValue;
			var finalPixelValue = operation.startValue;
			if(self.targetTiddlers && self.targetTiddlers.length > 0) {
				var firstTiddler = self.targetTiddlers[0];
				var tiddler = self.wiki.getTiddler(firstTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(firstTiddler, self.defaultValue || "200px");
				}
				finalValue = getNumericValue(currentValue);
				// Calculate pixel value
				var currentUnit = self.getUnit(currentValue);
				var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
				var parentSize = getParentSize(referenceElement);
				finalPixelValue = self.convertToPixels(finalValue, currentUnit, parentSize, referenceElement);
			} else if(self.targetTiddler) {
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				finalValue = getNumericValue(currentValue);
				// Calculate pixel value
				var currentUnit = self.getUnit(currentValue);
				var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
				var parentSize = getParentSize(referenceElement);
				finalPixelValue = self.convertToPixels(finalValue, currentUnit, parentSize, referenceElement);
			}
			
			var formattedValue = self.formatValueWithUnit(finalValue, self.unit);
			// Set variables for the action string
			self.setVariable("tv-action-value", finalValue.toString());
			self.setVariable("tv-action-value-pixels", finalPixelValue.toString());
			self.setVariable("tv-action-formatted-value", formattedValue);
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-property", self.targetProperty);
			self.setVariable("tv-action-handle-size", operation.handleSize.toString());
			self.setVariable("tv-action-parent-size", operation.parentSizeAtStart.toString());
			if(operation.splitPair) {
				setSplitPairActionVariables(operation, operation.splitPair.lastClampedDelta || 0, "resize-end");
			}
			self.invokeActionString(self.onResizeEnd, self);
		}
	};
	
	// Create gotpointercapture handler
	var handleGotPointerCapture = function(event) {
		// Ensure touch-action is properly set when we get capture
		if(domNode) {
			domNode.style.touchAction = "none";
		}
		// Prevent any default touch behavior
		event.preventDefault();
	};
	
	// Store the event handler reference for cleanup
	self.handlePointerDownReference = handlePointerDown;
	self.handleGotPointerCaptureReference = handleGotPointerCapture;
	
	// Add pointer event listeners
	// Only pointerdown on the element itself
	domNode.addEventListener("pointerdown", handlePointerDown, {passive: false});
	
	// Also add touchstart as a fallback for devices with poor pointer event support
	self.handleTouchStartReference = function(e) {
		// Only handle if pointer events aren't working
		if(!self.activeResizeOperations || Object.keys(self.activeResizeOperations).length === 0) {
			e.preventDefault();
			var touch = e.changedTouches[0];
			if(touch) {
				handlePointerDown({
					pointerId: touch.identifier,
					pointerType: "touch",
					clientX: touch.clientX,
					clientY: touch.clientY,
					target: e.target,
					preventDefault: function() {},
					stopPropagation: function() {}
				});
			}
		}
	};
	domNode.addEventListener("touchstart", self.handleTouchStartReference, {passive: false});
	
	// Register with global manager for document-level events
	GlobalResizerManager.addWidget(self);
	
	// Handle pointer capture events (use global handler for lost capture)
	self.handleLostPointerCaptureReference = function(event) {
		// Defensive null check
		if(self && self.handlePointerUpGlobal) {
			self.handlePointerUpGlobal(event);
		}
	};
	domNode.addEventListener("lostpointercapture", self.handleLostPointerCaptureReference);
	domNode.addEventListener("gotpointercapture", handleGotPointerCapture);
};

/*
Compute the internal state of the widget
*/

};
