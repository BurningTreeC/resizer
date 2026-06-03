/*\
title: $:/plugins/BTC/resizer/modules/widgets/resizer-render.js
type: application/javascript
module-type: library

Extracted compatibility module for the BTC resizer widget.
\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.install = function(ResizerWidget) {

ResizerWidget.prototype.render = function(parent,nextSibling) {
	// Check if parent exists - if not, mark for retry on next refresh
	if(!parent) {
		console.warn("ResizerWidget.render: parent is null, will retry on next refresh");
		this.parentDomNode = null;
		this.domNodes = [];
		this.needsRenderRetry = true;
		return;
	}
	// Clear retry flag if we successfully have a parent
	this.needsRenderRetry = false;
	// Save the parent dom node
	this.parentDomNode = parent;
	// Compute our attributes
	this.computeAttributes();
	// Execute our logic
	this.execute();
	// Create our element
	var domNode = this.document.createElement("div");
	domNode.className = "tc-resizer " + (this.resizerClass || "") + (this.disable === "yes" ? " tc-resizer-disabled" : "");
	domNode.setAttribute("data-direction", this.direction);
	domNode.setAttribute("data-handle-position", this.handlePosition);
	// Add handle style attribute for CSS styling
	if(this.handleStyle) {
		domNode.setAttribute("data-handle-style", this.handleStyle);
	}
	if(this.disable === "yes") {
		domNode.setAttribute("data-disabled", "true");
	}
	// Ensure touch-action is set for touch devices
	// Always use "none" to prevent any browser touch gestures
	domNode.style.touchAction = "none";
	domNode.style.msTouchAction = "none"; // For older IE/Edge
	domNode.style.webkitTouchAction = "none"; // For older webkit
	domNode.style.webkitUserSelect = "none"; // Prevent selection on iOS
	domNode.style.userSelect = "none";
	
	// Ensure the element can receive touch events on iOS
	domNode.style.webkitTapHighlightColor = "rgba(0,0,0,0)";
	// Add event handlers only if not disabled
	if(this.disable !== "yes") {
		this.addEventHandlers(domNode);
		// Add double-click handler for reset
		this.addDoubleClickHandler(domNode);
	}
	// Insert element based on handle position
	try {
		if(this.handlePosition === "before" && this.targetElement && parent[this.targetElement]) {
			var target = parent[this.targetElement];
			target.parentNode.insertBefore(domNode, target);
		} else if(this.handlePosition === "overlay") {
			// For overlay mode, we'll position it absolutely over the target
			domNode.style.position = "absolute";
			parent.insertBefore(domNode,nextSibling);
		} else {
			// Default "after" behavior
			parent.insertBefore(domNode,nextSibling);
		}
	} catch(e) {
		// Fallback to default insertion if custom insertion fails
		console.error("Error inserting resizer element:", e);
		if(parent) {
			parent.insertBefore(domNode,nextSibling);
		}
	}
	this.renderChildren(domNode,null);
	this.domNodes.push(domNode);
};

/*
Trigger haptic feedback with fallback support
*/
ResizerWidget.prototype.triggerHaptic = function(pattern) {
	try {
		// Convert single number to array
		if(typeof pattern === "number") {
			pattern = [pattern];
		}
		
		// Debug logging if enabled
		if(this.hapticDebug === "yes") {
			console.log("Attempting haptic feedback:", pattern);
			console.log("Navigator object:", window.navigator);
			console.log("Vibrate function:", window.navigator && window.navigator.vibrate);
		}
		
		// Try standard Vibration API
		if(window.navigator && typeof window.navigator.vibrate === "function") {
			// Some browsers require user gesture and return false if blocked
			var result = window.navigator.vibrate(pattern);
			if(this.hapticDebug === "yes") {
				console.log("Vibrate result:", result);
			}
			if(result === false) {
				console.log("Haptic feedback blocked - user gesture may be required");
			}
			return result;
		}
		
		// Try webkit-specific vibrate (older iOS)
		if(window.navigator && typeof window.navigator.webkitVibrate === "function") {
			if(this.hapticDebug === "yes") {
				console.log("Using webkit vibrate");
			}
			return window.navigator.webkitVibrate(pattern);
		}
		
		// Try mozilla-specific vibrate (older Firefox)
		if(window.navigator && typeof window.navigator.mozVibrate === "function") {
			if(this.hapticDebug === "yes") {
				console.log("Using mozilla vibrate");
			}
			return window.navigator.mozVibrate(pattern);
		}
		
		// Try ms-specific vibrate (older Edge/IE)
		if(window.navigator && typeof window.navigator.msVibrate === "function") {
			if(this.hapticDebug === "yes") {
				console.log("Using MS vibrate");
			}
			return window.navigator.msVibrate(pattern);
		}
		
		// No vibration API available
		if(this.hapticDebug === "yes") {
			console.log("No vibration API available");
		}
		return false;
	} catch(e) {
		// Fail silently unless in debug mode
		if(this.hapticDebug === "yes") {
			console.error("Haptic feedback error:", e);
		}
		return false;
	}
};

/*
Add double-click handler for reset functionality
*/
ResizerWidget.prototype.addDoubleClickHandler = function(domNode) {
	var self = this;
	
	// Variables for double-tap detection
	var lastTapTime = 0;
	var doubleTapDelay = 300; // Maximum time between taps for double-tap (ms)
	
	// Common handler for both double-click and double-tap
	var handleDoubleActivation = function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		// Check if custom dblClickActions are defined
		if(self.dblClickActions) {
			// Get current value and parent size for action variables
			var targetElement = domNode.previousElementSibling || domNode.parentElement;
			var parentSize = 0;
			var handleSize = 0;
			
			// Get the handle size
			var computedStyle = self.document.defaultView.getComputedStyle(domNode);
			if(self.direction === "horizontal") {
				handleSize = parseFloat(computedStyle.width) || 0;
			} else {
				handleSize = parseFloat(computedStyle.height) || 0;
			}
			
			// Get parent size
			if(targetElement && targetElement.parentElement) {
				var parentElement = targetElement.parentElement;
				if(self.position === "relative") {
					parentSize = self.direction === "horizontal" ? parentElement.offsetWidth : parentElement.offsetHeight;
				} else {
					var parentRect = parentElement.getBoundingClientRect();
					parentSize = self.direction === "horizontal" ? parentRect.width : parentRect.height;
				}
			}
			
			// Get current value from tiddler
			var currentValue = self.defaultValue;
			var currentPixelValue = 0;
			if(self.targetTiddlers && self.targetTiddlers.length > 0) {
				var firstTiddler = self.targetTiddlers[0];
				var tiddler = self.wiki.getTiddler(firstTiddler);
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue;
				} else {
					currentValue = self.wiki.getTiddlerText(firstTiddler, self.defaultValue);
				}
			} else if(self.targetTiddler) {
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue;
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue);
				}
			}
			
			// Calculate pixel value of current value
			currentPixelValue = self.evaluateCSSValue(currentValue, parentSize, handleSize);
			
			// Set variables for the action string
			self.setVariable("tv-action-value", currentValue);
			self.setVariable("tv-action-value-pixels", currentPixelValue.toString());
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-parent-size", parentSize.toString());
			self.setVariable("tv-action-handle-size", handleSize.toString());
			
			// Trigger haptic feedback on mobile
			if(self.hapticFeedback === "yes") {
				self.triggerHaptic([10, 50, 10]);
			}
			
			// Execute the custom double-click actions
			self.invokeActionString(self.dblClickActions, self);
			return;
		}
		
		// Optional preset cycling. This is intentionally evaluated after custom
		// dblClickActions so existing double-click actions keep their old priority.
		if(self.presetCycle === "yes" && self.presets) {
			if(self.applyNextPreset(domNode)) {
				return;
			}
		}

		// If no custom actions, proceed with reset behavior
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
		
		// Helper to get numeric value from a string with units
		var getNumericValue = function(value) {
			return parseFloat(value) || 0;
		};
		
		// Get measurements for calc() evaluation
		var targetElement = domNode.previousElementSibling || domNode.parentElement;
		var parentSize = 0;
		var handleSize = getHandleSize();
		if(targetElement && targetElement.parentElement) {
			var parentElement = targetElement.parentElement;
			if(self.position === "relative") {
				parentSize = self.direction === "horizontal" ? parentElement.offsetWidth : parentElement.offsetHeight;
			} else {
				var parentRect = parentElement.getBoundingClientRect();
				parentSize = self.direction === "horizontal" ? parentRect.width : parentRect.height;
			}
		}
		
		// Determine reset value based on resetTo attribute
		var resetValue;
		var resetPixelValue;
		switch(self.resetTo) {
			case "min":
				var minRawValue = self.minValueRaw || (self.unit === "%" ? "10%" : "50px");
				// Evaluate to pixels (handles calc() expressions)
				resetPixelValue = self.evaluateCSSValue(minRawValue, parentSize, handleSize);
				// Convert to widget's unit
				var minConvertedValue = self.convertFromPixels(resetPixelValue, self.unit, parentSize, targetElement);
				// Format with appropriate unit
				resetValue = self.formatValueWithUnit(minConvertedValue);
				break;
			case "max":
				var maxRawValue = self.maxValueRaw || (self.unit === "%" ? "90%" : "800px");
				// Evaluate to pixels (handles calc() expressions)
				resetPixelValue = self.evaluateCSSValue(maxRawValue, parentSize, handleSize);
				// Convert to widget's unit
				var maxConvertedValue = self.convertFromPixels(resetPixelValue, self.unit, parentSize, targetElement);
				// Format with appropriate unit
				resetValue = self.formatValueWithUnit(maxConvertedValue);
				break;
			case "custom":
				var customRawValue = self.resetValue || self.defaultValue;
				// Evaluate to pixels (handles calc() expressions)
				resetPixelValue = self.evaluateCSSValue(customRawValue, parentSize, handleSize);
				// Convert to widget's unit
				var customConvertedValue = self.convertFromPixels(resetPixelValue, self.unit, parentSize, targetElement);
				// Format with appropriate unit
				resetValue = self.formatValueWithUnit(customConvertedValue);
				break;
			default: // "default"
				// Evaluate default value to pixels (handles calc() expressions)
				resetPixelValue = self.evaluateCSSValue(self.defaultValue, parentSize, handleSize);
				// Convert to widget's unit
				var defaultConvertedValue = self.convertFromPixels(resetPixelValue, self.unit, parentSize, targetElement);
				// Format with appropriate unit
				resetValue = self.formatValueWithUnit(defaultConvertedValue);
		}
		
		// Apply smooth transition if enabled
		if(self.smoothReset === "yes") {
			// Find target elements for smooth animation
			var targetElements = self.getTargetElements(domNode);
			
			// Add transition to elements
			targetElements.forEach(function(element) {
				element.style.transition = self.targetProperty + " 0.3s ease-out";
				// Remove transition after animation
				setTimeout(function() {
					element.style.transition = "";
				}, 300);
			});
		}
		
		// Update tiddler values
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				self.wiki.setText(tiddlerTitle, self.targetField || "text", null, resetValue);
			});
		} else if(self.targetTiddler) {
			self.wiki.setText(self.targetTiddler, self.targetField || "text", null, resetValue);
		}
		
		// Publish CSS variables after reset, without changing the legacy tiddler write.
		if(self.cssVariable) {
			var resetTargets = self.getTargetElements(domNode);
			if(resetTargets && resetTargets.length > 0) {
				$tw.utils.each(resetTargets, function(element) {
					self.publishCSSVariable(resetValue, element);
				});
			} else {
				self.publishCSSVariable(resetValue, domNode);
			}
		}

		// Trigger haptic feedback on mobile
		if(self.hapticFeedback === "yes") {
			self.triggerHaptic([10, 50, 10]);
		}
		
		// Call reset action if provided
		if(self.onReset) {
			// resetPixelValue was already calculated above based on resetTo setting
			// parentSize was also already calculated above
			self.setVariable("tv-action-value", resetValue);
			self.setVariable("tv-action-value-pixels", resetPixelValue.toString());
			self.setVariable("tv-action-direction", self.direction);
			self.setVariable("tv-action-parent-size", parentSize.toString());
			self.invokeActionString(self.onReset, self);
		}
	};
	
	// Store reference for cleanup
	self.handleDoubleClickReference = handleDoubleActivation;
	
	// Double-click handler for desktop
	domNode.addEventListener("dblclick", self.handleDoubleClickReference);
	
	// Touch end handler for double-tap detection
	self.handleTouchTapReference = function(event) {
		// Only handle touch events
		if(event.pointerType !== "touch") return;

		// Do not treat an actual drag as a double-tap. The pointerup listener on
		// the handle can run before document-level cleanup, so the active resize
		// operation is still available here in normal pointer-event flow.
		var operation = self.activeResizeOperations && self.activeResizeOperations[event.pointerId];
		if(operation && operation.hasDragged) {
			lastTapTime = 0;
			return;
		}

		var currentTime = Date.now();
		var tapTimeDiff = currentTime - lastTapTime;

		if(tapTimeDiff < doubleTapDelay && tapTimeDiff > 0) {
			// This is a double-tap
			event.preventDefault();
			event.stopPropagation();
			handleDoubleActivation(event);
			lastTapTime = 0; // Reset to prevent triple-tap
		} else {
			// This is the first tap - record time
			lastTapTime = currentTime;
		}
	};
	
	// Add pointer up listener for double-tap detection (doesn't interfere with drag)
	domNode.addEventListener("pointerup", self.handleTouchTapReference, {passive: false});
};

/*
Add event handlers to the resizer
*/

};

/* WARNING: grid-track mode dispatch not automatically inserted. */
