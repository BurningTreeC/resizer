/*\
title: $:/plugins/BTC/resizer/modules/widgets/resizer-lifecycle.js
type: application/javascript
module-type: library

Extracted compatibility module for the BTC resizer widget.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var GlobalResizerManager = require("$:/plugins/BTC/resizer/modules/utils/global-manager.js").GlobalResizerManager;

exports.install = function(ResizerWidget, Widget) {

ResizerWidget.prototype.execute = function() {
	// Get our parameters
	this.direction = this.getAttribute("direction", "horizontal"); // horizontal or vertical
	this.targetTiddler = this.getAttribute("tiddler");
	this.targetFilter = this.getAttribute("filter");
	// Parse tiddler attribute as a filter expression
	this.targetTiddlers = this.targetFilter ? this.wiki.filterTiddlers(this.targetFilter) : [];
	this.targetField = this.getAttribute("field", "text");
	this.targetSelector = this.getAttribute("selector");
	this.targetElement = this.getAttribute("element"); // parent, previousSibling, nextSibling
	this.targetProperty = this.getAttribute("property", this.direction === "horizontal" ? "width" : "height"); // CSS property to modify
	this.unit = this.getAttribute("unit", "px");
	this.position = this.getAttribute("position", "absolute"); // absolute or relative
	this.defaultValue = this.getAttribute("default", this.unit === "%" ? "50%" : "200px");
	// Store raw min/max values for calc() support
	this.minValueRaw = this.getAttribute("min");
	this.maxValueRaw = this.getAttribute("max");
	// Parse min/max values - defaults depend on unit type
	var minDefault = this.unit === "%" ? "10" : "50";
	var maxDefault = this.unit === "%" ? "90" : "800";
	this.minValue = this.minValueRaw ? parseFloat(this.minValueRaw) : parseFloat(minDefault);
	this.maxValue = this.maxValueRaw ? parseFloat(this.maxValueRaw) : parseFloat(maxDefault);
	this.invertDirection = this.getAttribute("invert", "no");
	this.liveResize = this.getAttribute("live", "no");
	this.resizerClass = this.getAttribute("class", "");
	this.actions = this.getAttribute("actions");
	this.aspectRatio = this.getAttribute("aspectRatio"); // e.g., "16:9" or "1.5"
	this.resizeMode = this.getAttribute("mode", "single"); // single, multiple, or split-pair
	// Grid-track mode: CSS Grid column-boundary resizing.
	// Used by mode="grid-track"; kept separate from normal single/multiple/split-pair logic.
	this.gridSelector = this.getAttribute("gridSelector", this.getAttribute("gridTrackSelector", ""));
	this.gridTrackSelector = this.gridSelector;
	this.gridTrackIndex = this.getAttribute("gridTrackIndex", this.getAttribute("trackIndex", "1"));
	this.gridTrackStatePrefix = this.getAttribute("gridTrackStatePrefix", this.getAttribute("statePrefix", this.getAttribute("tiddler", "$:/state/grid")));
	this.gridTrackField = this.getAttribute("gridTrackField", this.getAttribute("field", "text"));
	this.gridTrackUnit = this.getAttribute("gridTrackUnit", this.getAttribute("unit", "%"));
	this.gridTrackMin = this.getAttribute("gridTrackMin", this.getAttribute("min", "4%"));
	this.gridTrackMax = this.getAttribute("gridTrackMax", this.getAttribute("max", ""));
	this.gridTrackSnap = this.getAttribute("gridTrackSnap", this.getAttribute("snap", ""));
	this.gridTrackSnapDistance = this.getAttribute("gridTrackSnapDistance", this.getAttribute("snapDistance", "0px"));
	this.gridTrackCssVariablePrefix = this.getAttribute("gridTrackCssVariablePrefix", this.getAttribute("cssVariablePrefix", "--btc-rgrid-col-"));
	this.gridTrackLive = this.getAttribute("gridTrackLive", this.getAttribute("live", "yes"));
	this.gridTrackSave = this.getAttribute("gridTrackSave", this.getAttribute("save", "end"));
	this.gridTrackLiveUnit = this.getAttribute("gridTrackLiveUnit", this.getAttribute("liveUnit", "px"));
	this.gridTrackSaveUnit = this.getAttribute("gridTrackSaveUnit", this.getAttribute("saveUnit", "px"));
	this.gridTrackFreezeOnStart = this.getAttribute("gridTrackFreezeOnStart", this.getAttribute("freezeOnStart", "yes"));
	this.gridTrackFreezeOnEnd = this.getAttribute("gridTrackFreezeOnEnd", this.getAttribute("freezeOnEnd", "yes"));

	// Optional snap points. Example: snap="0px 16rem 33% 50%" snapDistance="12px".
	this.snap = this.getAttribute("snap");
	this.snapDistance = this.getAttribute("snapDistance", "8px");
	this.snapHaptic = this.getAttribute("snapHaptic", "no");

	// Optional preset cycling on double-click/double-tap. Existing dblClickActions
	// still take priority to preserve backwards compatibility.
	this.presets = this.getAttribute("presets");
	this.presetCycle = this.getAttribute("presetCycle", "no");
	this.presetTiddler = this.getAttribute("presetTiddler");
	this.presetField = this.getAttribute("presetField", "text");
	this.presetIndexTiddler = this.getAttribute("presetIndexTiddler");
	this.presetIndexField = this.getAttribute("presetIndexField", "text");

	// Optional CSS variable publishing. This is additive: tiddler writes and live
	// element styles remain unchanged.
	this.cssVariable = this.getAttribute("cssVariable");
	this.cssVariableSecondary = this.getAttribute("cssVariableSecondary");
	this.cssVariableTarget = this.getAttribute("cssVariableTarget", "target"); // target, parent, root, selector
	this.cssVariableSelector = this.getAttribute("cssVariableSelector");
	this.leftCssVariable = this.getAttribute("leftCssVariable");
	this.rightCssVariable = this.getAttribute("rightCssVariable");
	this.topCssVariable = this.getAttribute("topCssVariable");
	this.bottomCssVariable = this.getAttribute("bottomCssVariable");


	// Split-pair mode resizes two adjacent elements as a coupled pair.
	// horizontal: left side grows by delta, right side shrinks by the same delta.
	// vertical:   top side grows by delta, bottom side shrinks by the same delta.
	this.leftTiddler = this.getAttribute("leftTiddler");
	this.rightTiddler = this.getAttribute("rightTiddler");
	this.topTiddler = this.getAttribute("topTiddler");
	this.bottomTiddler = this.getAttribute("bottomTiddler");

	this.leftField = this.getAttribute("leftField", this.targetField || "text");
	this.rightField = this.getAttribute("rightField", this.targetField || "text");
	this.topField = this.getAttribute("topField", this.targetField || "text");
	this.bottomField = this.getAttribute("bottomField", this.targetField || "text");

	this.leftSelector = this.getAttribute("leftSelector");
	this.rightSelector = this.getAttribute("rightSelector");
	this.topSelector = this.getAttribute("topSelector");
	this.bottomSelector = this.getAttribute("bottomSelector");

	this.splitPairLiveResize = this.getAttribute("splitPairLiveResize", this.liveResize);
	this.splitPairSave = this.getAttribute("splitPairSave", "end"); // "end" avoids refresh flicker during split-pair drags
	this.handlePosition = this.getAttribute("handlePosition", "after"); // before, after, overlay
	this.onBeforeResizeStart = this.getAttribute("onBeforeResizeStart");
	this.onResizeStart = this.getAttribute("onResizeStart");
	this.onResize = this.getAttribute("onResize");
	this.onResizeEnd = this.getAttribute("onResizeEnd");
	this.disable = this.getAttribute("disable", "no");
	// Double-click reset attributes
	this.resetTo = this.getAttribute("resetTo", "default"); // default, min, max, custom
	this.resetValue = this.getAttribute("resetValue");
	this.smoothReset = this.getAttribute("smoothReset", "yes");
	this.onReset = this.getAttribute("onReset");
	this.dblClickActions = this.getAttribute("dblClickActions");
	// Handle style attribute
	this.handleStyle = this.getAttribute("handleStyle", "solid"); // solid, dots, lines, chevron, grip
	// Haptic feedback
	this.hapticFeedback = this.getAttribute("hapticFeedback", "yes");
	this.hapticDebug = this.getAttribute("hapticDebug", "no"); // Debug mode for haptic feedback
	// Only visible portion option
	this.visiblePortion = this.getAttribute("visiblePortion", "no");
	// Make child widgets
	this.makeChildWidgets();
};

/*
Common cleanup logic shared between removeChildDomNodes and destroy
*/
ResizerWidget.prototype.performCleanup = function() {
	var self = this;
	
	// 1. Clean up all active operations with full detail
	if(self.activeResizeOperations) {
		for(var pointerId in self.activeResizeOperations) {
			if(self.activeResizeOperations.hasOwnProperty(pointerId)) {
				var operation = self.activeResizeOperations[pointerId];
				if(operation) {
					// Cancel any pending animation frame
					if(operation.animationFrameId) {
						cancelAnimationFrame(operation.animationFrameId);
						operation.animationFrameId = null;
					}
					// Clear pending events
					operation.pendingMouseEvent = null;
					// Clear DOM references in operation
					if(operation.targetElements) {
						operation.targetElements = null;
					}
					operation.targetElement = null;
					// Clear cursor reference
					operation.cursor = null;
					// Release pointer capture if held
					if(operation.hasPointerCapture && self.domNode && self.domNode.releasePointerCapture) {
						try {
							self.domNode.releasePointerCapture(pointerId);
						} catch(e) {
							// Ignore errors
						}
					}
				}
				// Call cleanup
				if(self.cleanupResize) {
					self.cleanupResize(pointerId);
				}
			}
		}
		// Clear the operations object
		self.activeResizeOperations = {};
	}
	
	// 2. Clear all timeouts immediately
	if(self.operationTimeouts) {
		for(var timeoutId in self.operationTimeouts) {
			if(self.operationTimeouts.hasOwnProperty(timeoutId)) {
				clearTimeout(self.operationTimeouts[timeoutId]);
			}
		}
		self.operationTimeouts = {};
	}
	
	// 3. Remove all event listeners from DOM elements
	if(self.domNodes && self.domNodes[0]) {
		var domNode = self.domNodes[0];
		
		// Remove all event listeners with stored references
		var listeners = [
			{ref: 'handlePointerDownReference', event: 'pointerdown'},
			{ref: 'handleLostPointerCaptureReference', event: 'lostpointercapture'},
			{ref: 'handleGotPointerCaptureReference', event: 'gotpointercapture'},
			{ref: 'handleDoubleClickReference', event: 'dblclick'},
			{ref: 'handleTouchStartReference', event: 'touchstart'},
			{ref: 'handleTouchTapReference', event: 'pointerup'}
		];
		
		for(var i = 0; i < listeners.length; i++) {
			if(self[listeners[i].ref]) {
				domNode.removeEventListener(listeners[i].event, self[listeners[i].ref]);
				self[listeners[i].ref] = null;
			}
		}
		
		// Force release all pointer captures (defensive)
		if(domNode.releasePointerCapture) {
			try {
				// Try to release captures for pointer IDs 0-10
				for(var ptr = 0; ptr < 10; ptr++) {
					domNode.releasePointerCapture(ptr);
				}
			} catch(e) {
				// Ignore errors
			}
		}
	}
	
	// 4. Remove from global manager
	if(typeof GlobalResizerManager !== "undefined") {
		GlobalResizerManager.removeWidget(self);
	}
	
	// 5. Clear all function references to break closure chains
	self.handlePointerMoveGlobal = null;
	self.handlePointerUpGlobal = null;
	self.handlePointerDownReference = null;
	self.handleLostPointerCaptureReference = null;
	self.handleGotPointerCaptureReference = null;
	self.handleDoubleClickReference = null;
	self.handleTouchStartReference = null;
	self.handleTouchTapReference = null;
	self.triggerHaptic = null;
	self.cleanupResize = null;
	
	// 6. Clear caches and data structures
	self.parentSizeCache = {};
	self.parentSizeCacheOrder = [];
	
	// 7. Clear DOM references (but keep widget framework properties intact)
	self.domNode = null;
	// Note: parentDomNode and domNodes are managed by the base Widget class
	// Don't null them as the parent class expects them to exist
	
	// 8. Clear all attribute values to free memory
	// Clear all properties in both cases to prevent memory leaks
	self.actions = null;
	self.onResizeStart = null;
	self.onResize = null;
	self.onResizeEnd = null;
	self.onReset = null;
	self.direction = null;
	self.targetTiddler = null;
	self.targetFilter = null;
	self.targetTiddlers = null;
	self.targetField = null;
	self.targetSelector = null;
	self.targetElement = null;
	self.targetProperty = null;
	self.unit = null;
	self.position = null;
	self.defaultValue = null;
	self.minValueRaw = null;
	self.maxValueRaw = null;
	self.minValue = null;
	self.maxValue = null;
	self.invertDirection = null;
	self.liveResize = null;
	self.resizerClass = null;
	self.aspectRatio = null;
	self.resizeMode = null;
	self.handlePosition = null;
	self.disable = null;
	self.resetTo = null;
	self.resetValue = null;
	self.smoothReset = null;
	self.handleStyle = null;
	self.hapticFeedback = null;
	self.hapticDebug = null;
	self.visiblePortion = null;
	self.snap = null;
	self.snapDistance = null;
	self.snapHaptic = null;
	self.presets = null;
	self.presetCycle = null;
	self.presetTiddler = null;
	self.presetField = null;
	self.presetIndexTiddler = null;
	self.presetIndexField = null;
	self.cssVariable = null;
	self.cssVariableSecondary = null;
	self.cssVariableTarget = null;
	self.cssVariableSelector = null;
	self.leftCssVariable = null;
	self.rightCssVariable = null;
	self.topCssVariable = null;
	self.bottomCssVariable = null;
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
ResizerWidget.prototype.refresh = function(changedTiddlers) {
	// Check if we need to retry rendering due to previously null parent
	if(this.needsRenderRetry) {
		// Try to get parent from the DOM if we have a reference
		var parent = this.parentDomNode || (this.domNodes && this.domNodes[0] && this.domNodes[0].parentNode);
		if(parent) {
			console.log("ResizerWidget: Retrying render after parent became available");
			this.refreshSelf();
			return true;
		}
	}
	
	var changedAttributes = this.computeAttributes();
	if(Object.keys(changedAttributes).length) {
		// Check if only min/max/default values changed
		var onlyValueChanged = true;
		var attributeNames = Object.keys(changedAttributes);
		for(var i = 0; i < attributeNames.length; i++) {
			if(attributeNames[i] !== "min" && attributeNames[i] !== "max" && attributeNames[i] !== "default") {
				onlyValueChanged = false;
				break;
			}
		}
		
		if(onlyValueChanged) {
			// Update only the min/max/default values without full refresh
			if(changedAttributes.min !== undefined) {
				this.minValueRaw = this.getAttribute("min");
				var minDefault = this.unit === "%" ? "10" : "50";
				this.minValue = this.minValueRaw ? parseFloat(this.minValueRaw) : parseFloat(minDefault);
			}
			if(changedAttributes.max !== undefined) {
				this.maxValueRaw = this.getAttribute("max");
				var maxDefault = this.unit === "%" ? "90" : "800";
				this.maxValue = this.maxValueRaw ? parseFloat(this.maxValueRaw) : parseFloat(maxDefault);
			}
			if(changedAttributes.default !== undefined) {
				this.defaultValue = this.getAttribute("default", this.unit === "%" ? "50%" : "200px");
			}
			// Return false since we handled the update without re-rendering
			return false;
		} else {
			// Full refresh for other attribute changes
			this.refreshSelf();
			return true;
		}
	}
	return this.refreshChildren(changedTiddlers);
};

/*
Remove any DOM elements created by this widget
*/
ResizerWidget.prototype.removeChildDomNodes = function() {
	// Use shared cleanup logic
	this.performCleanup();
	
	// Call parent implementation
	Widget.prototype.removeChildDomNodes.call(this);
};

/*
Destroy the widget and clean up resources - For future TiddlyWiki versions
*/
ResizerWidget.prototype.destroy = function() {
	// Use shared cleanup logic
	this.performCleanup();
	
	// Call parent destroy if it exists
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};

};

/* grid-track attributes are parsed by grid-track module fallback */
