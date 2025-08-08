/*\
title: $:/plugins/BTC/resizer/modules/widgets/resizer.js
type: application/javascript
module-type: widget

Resizer widget for resizing elements

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

// Global manager for document-level event listeners shared across all resizer instances
var GlobalResizerManager = {
	documentListenersAdded: false,
	activeWidgets: [],
	handlePointerMove: null,
	handlePointerUp: null,
	referenceCount: 0,
	
	addWidget: function(widget) {
		if(this.activeWidgets.indexOf(widget) === -1) {
			this.activeWidgets.push(widget);
			this.referenceCount++;
		}
		this.ensureDocumentListeners();
	},
	
	removeWidget: function(widget) {
		var index = this.activeWidgets.indexOf(widget);
		if(index > -1) {
			this.activeWidgets.splice(index, 1);
			this.referenceCount--;
		}
		// Remove document listeners if no widgets are active
		if(this.referenceCount <= 0) {
			this.referenceCount = 0;
			this.activeWidgets = [];
			this.removeDocumentListeners();
		}
	},
	
	ensureDocumentListeners: function() {
		if(!this.documentListenersAdded && typeof document !== "undefined") {
			var self = this;
			
			this.handlePointerMove = function(event) {
				// Dispatch to all active widgets
				for(var i = 0; i < self.activeWidgets.length; i++) {
					var widget = self.activeWidgets[i];
					if(widget.handlePointerMoveGlobal) {
						widget.handlePointerMoveGlobal(event);
					}
				}
			};
			
			this.handlePointerUp = function(event) {
				// Dispatch to all active widgets
				for(var i = 0; i < self.activeWidgets.length; i++) {
					var widget = self.activeWidgets[i];
					if(widget.handlePointerUpGlobal) {
						widget.handlePointerUpGlobal(event);
					}
				}
			};
			
			document.addEventListener("pointermove", this.handlePointerMove, {passive: false});
			document.addEventListener("pointerup", this.handlePointerUp, {passive: false});
			document.addEventListener("pointercancel", this.handlePointerUp, {passive: false});
			this.documentListenersAdded = true;
		}
	},
	
	removeDocumentListeners: function() {
		if(this.documentListenersAdded && typeof document !== "undefined") {
			if(this.handlePointerMove) {
				document.removeEventListener("pointermove", this.handlePointerMove);
			}
			if(this.handlePointerUp) {
				document.removeEventListener("pointerup", this.handlePointerUp);
				document.removeEventListener("pointercancel", this.handlePointerUp);
			}
			this.documentListenersAdded = false;
			this.handlePointerMove = null;
			this.handlePointerUp = null;
		}
	}
};

var ResizerWidget = function(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
};

/*
Inherit from the base widget class
*/
ResizerWidget.prototype = new Widget();


/*
Render this widget into the DOM
*/
ResizerWidget.prototype.render = function(parent,nextSibling) {
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
		parent.insertBefore(domNode,nextSibling);
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
	
	// Store reference for cleanup
	self.handleDoubleClickReference = function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		// Determine reset value based on resetTo attribute
		var resetValue;
		switch(self.resetTo) {
			case "min":
				resetValue = (self.minValueRaw || (self.unit === "%" ? "10%" : "50px"));
				break;
			case "max":
				resetValue = (self.maxValueRaw || (self.unit === "%" ? "90%" : "800px"));
				break;
			case "custom":
				resetValue = self.resetValue || self.defaultValue;
				break;
			default: // "default"
				resetValue = self.defaultValue;
		}
		
		// Apply smooth transition if enabled
		if(self.smoothReset === "yes") {
			// Find target elements for smooth animation
			var targetElements = [];
			if(self.targetSelector) {
				if(self.resizeMode === "multiple") {
					targetElements = Array.from(self.document.querySelectorAll(self.targetSelector));
				} else {
					var singleElement = self.document.querySelector(self.targetSelector);
					if(singleElement) targetElements = [singleElement];
				}
			} else if(domNode.previousElementSibling) {
				targetElements = [domNode.previousElementSibling];
			}
			
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
		
		// Trigger haptic feedback on mobile
		if(self.hapticFeedback === "yes") {
			self.triggerHaptic([10, 50, 10]);
		}
		
		// Call reset action if provided
		if(self.onReset) {
			self.setVariable("actionValue", resetValue);
			self.setVariable("actionDirection", self.direction);
			self.invokeActionString(self.onReset, self);
		}
	};
	
	domNode.addEventListener("dblclick", self.handleDoubleClickReference);
};

/*
Add event handlers to the resizer
*/
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
	
	// Helper to detect the unit of a value
	var getUnit = function(value) {
		if(typeof value !== "string") return "px";
		// Handle calc() expressions - default to px
		if(value.startsWith("calc(") && value.endsWith(")")) return "px";
		if(value.endsWith("%")) return "%";
		if(value.endsWith("px")) return "px";
		if(value.endsWith("em")) return "em";
		if(value.endsWith("rem")) return "rem";
		if(value.endsWith("vh")) return "vh";
		if(value.endsWith("vw")) return "vw";
		if(value.endsWith("vmin")) return "vmin";
		if(value.endsWith("vmax")) return "vmax";
		// If no unit specified, assume pixels
		return "px";
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
	
	// Helper to convert percentage to pixels based on parent size
	var convertPercentageToPixels = function(percentValue, parentSize) {
		return (percentValue / 100) * parentSize;
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
	
	// Convert any CSS unit to pixels
	var convertToPixels = function(value, unit, element) {
		var numericValue = parseFloat(value);
		if(isNaN(numericValue)) return 0;
		
		switch(unit) {
			case "px":
				return numericValue;
			case "%":
				return convertPercentageToPixels(numericValue, getParentSize(element || domNode));
			case "em":
				// em is relative to font-size of the element
				var fontSize = 16; // default fallback
				try {
					fontSize = parseFloat(self.document.defaultView.getComputedStyle(element || domNode).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return numericValue * fontSize;
			case "rem":
				// rem is relative to font-size of the root element
				var rootFontSize = 16; // default fallback
				try {
					rootFontSize = parseFloat(self.document.defaultView.getComputedStyle(self.document.documentElement).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return numericValue * rootFontSize;
			case "vh":
				// vh is 1% of viewport height
				var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				return numericValue * (viewportHeight / 100);
			case "vw":
				// vw is 1% of viewport width
				var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				return numericValue * (viewportWidth / 100);
			case "vmin":
				// vmin is 1% of viewport's smaller dimension
				var vw = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmin = Math.min(vw, vh);
				return numericValue * (vmin / 100);
			case "vmax":
				// vmax is 1% of viewport's larger dimension
				var vw2 = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh2 = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmax = Math.max(vw2, vh2);
				return numericValue * (vmax / 100);
			default:
				// Unknown unit, treat as pixels
				return numericValue;
		}
	};
	
	// Convert pixels back to the original unit
	var convertFromPixels = function(pixelValue, unit, element) {
		switch(unit) {
			case "px":
				return pixelValue;
			case "%":
				// For percentage calculations, we need the parent of the element being resized,
				// not the parent of the resizer widget itself
				var targetElement = element || domNode;
				var parentSize = getParentSize(targetElement);
				// If parent size is 0 or invalid during concurrent resize, try to get fresh measurement
				if(parentSize <= 0) {
					// Force fresh measurement
					parentSize = getParentSize(targetElement, true);
				}
				// Ensure we never return negative percentages or divide by zero
				return parentSize > 0 ? Math.max((pixelValue / parentSize) * 100, 0) : 0;
			case "em":
				var fontSize = 16; // default fallback
				try {
					fontSize = parseFloat(self.document.defaultView.getComputedStyle(element || domNode).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return fontSize > 0 ? pixelValue / fontSize : 0;
			case "rem":
				var rootFontSize = 16; // default fallback
				try {
					rootFontSize = parseFloat(self.document.defaultView.getComputedStyle(self.document.documentElement).fontSize) || 16;
				} catch(e) {
					// Use default if getComputedStyle fails
				}
				return rootFontSize > 0 ? pixelValue / rootFontSize : 0;
			case "vh":
				var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				return (pixelValue / viewportHeight) * 100;
			case "vw":
				var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				return (pixelValue / viewportWidth) * 100;
			case "vmin":
				var vw = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmin = Math.min(vw, vh);
				return (pixelValue / vmin) * 100;
			case "vmax":
				var vw2 = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
				var vh2 = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
				var vmax = Math.max(vw2, vh2);
				return (pixelValue / vmax) * 100;
			default:
				return pixelValue;
		}
	};
	
	// Robust calc() expression evaluator with support for nested expressions, parentheses, and all operations
	var evaluateCalcExpression = function(expression, contextSize, handleSize, depth) {
		// Limit recursion depth to prevent stack overflow
		depth = depth || 0;
		if(depth > 10) {
			console.warn("calc() expression too deeply nested, limiting depth");
			return 0;
		}
		
		// Tokenize the expression
		var tokens = [];
		var current = "";
		var i = 0;
		
		while(i < expression.length) {
			var char = expression[i];
			
			// Handle whitespace
			if(/\s/.test(char)) {
				if(current) {
					tokens.push(current);
					current = "";
				}
				i++;
				continue;
			}
			
			// Handle operators and parentheses
			if("+-*/()".indexOf(char) !== -1) {
				if(current) {
					tokens.push(current);
					current = "";
				}
				tokens.push(char);
				i++;
				continue;
			}
			
			// Handle nested calc()
			if(expression.substr(i, 5) === "calc(") {
				if(current) {
					tokens.push(current);
					current = "";
				}
				// Find matching closing parenthesis
				var depth = 1;
				var j = i + 5;
				while(j < expression.length && depth > 0) {
					if(expression[j] === "(") depth++;
					else if(expression[j] === ")") depth--;
					j++;
				}
				// Recursively evaluate nested calc with depth tracking
				var nestedExpr = expression.substring(i + 5, j - 1);
				var nestedResult = evaluateCalcExpression(nestedExpr, contextSize, handleSize, depth + 1);
				tokens.push(String(nestedResult));
				i = j;
				continue;
			}
			
			// Build current token
			current += char;
			i++;
		}
		
		if(current) {
			tokens.push(current);
		}
		
		// Convert tokens to values
		var values = [];
		var operators = [];
		
		for(var t = 0; t < tokens.length; t++) {
			var token = tokens[t];
			
			if("+-*/".indexOf(token) !== -1) {
				// Process higher precedence operators first
				while(operators.length > 0 && operators[operators.length - 1] !== "(" &&
					  getPrecedence(operators[operators.length - 1]) >= getPrecedence(token)) {
					processOperator(values, operators);
				}
				operators.push(token);
			} else if(token === "(") {
				operators.push(token);
			} else if(token === ")") {
				// Process until matching opening parenthesis
				while(operators.length > 0 && operators[operators.length - 1] !== "(") {
					processOperator(values, operators);
				}
				operators.pop(); // Remove the "("
			} else {
				// It's a value - convert to pixels
				values.push(convertToPixels(token, contextSize));
			}
		}
		
		// Process remaining operators
		while(operators.length > 0) {
			processOperator(values, operators);
		}
		
		return values[0] || 0;
		
		// Helper functions
		function getPrecedence(op) {
			if(op === "+" || op === "-") return 1;
			if(op === "*" || op === "/") return 2;
			return 0;
		}
		
		function processOperator(values, operators) {
			var op = operators.pop();
			var b = values.pop();
			var a = values.pop();
			
			if(a === undefined || b === undefined) {
				values.push(0);
				return;
			}
			
			switch(op) {
				case "+": values.push(a + b); break;
				case "-": values.push(a - b); break;
				case "*": values.push(a * b); break;
				case "/": values.push(b !== 0 ? a / b : 0); break;
			}
		}
		
		function convertToPixels(value, contextSize) {
			// Handle special variables
			if(value === "handleSize" || value === "handleWidth" || value === "handleHeight") {
				return handleSize || 0;
			}
			
			// If already a number, return it
			var num = parseFloat(value);
			if(!isNaN(num) && value === String(num)) {
				return num;
			}
			
			// Get viewport dimensions
			var viewportWidth = (self.document.defaultView || self.document.parentWindow || {}).innerWidth || self.document.documentElement.clientWidth;
			var viewportHeight = (self.document.defaultView || self.document.parentWindow || {}).innerHeight || self.document.documentElement.clientHeight;
			var vmin = Math.min(viewportWidth, viewportHeight);
			var vmax = Math.max(viewportWidth, viewportHeight);
			
			// Handle different units
			if(value.endsWith("px")) {
				return parseFloat(value);
			} else if(value.endsWith("vw")) {
				return (parseFloat(value) / 100) * viewportWidth;
			} else if(value.endsWith("vh")) {
				return (parseFloat(value) / 100) * viewportHeight;
			} else if(value.endsWith("vmin")) {
				return (parseFloat(value) / 100) * vmin;
			} else if(value.endsWith("vmax")) {
				return (parseFloat(value) / 100) * vmax;
			} else if(value.endsWith("%")) {
				return (parseFloat(value) / 100) * contextSize;
			} else if(value.endsWith("em") || value.endsWith("rem")) {
				// For em/rem, we need to get the computed font size
				// Default to 16px if we can't determine it
				var fontSize = 16;
				try {
					if(value.endsWith("rem")) {
						fontSize = parseFloat(getComputedStyle(self.document.documentElement).fontSize) || 16;
					} else if(self.domNodes && self.domNodes[0]) {
						fontSize = parseFloat(getComputedStyle(self.domNodes[0]).fontSize) || 16;
					}
				} catch(e) {
					// Fallback to default
				}
				return parseFloat(value) * fontSize;
			} else {
				// Try to parse as number (treat as pixels)
				return parseFloat(value) || 0;
			}
		}
	};
	
	// Helper to evaluate calc() expressions and other CSS values
	var evaluateCSSValue = function(value, contextSize, handleSize) {
		if(typeof value !== "string") return value;
		
		// Clean up the value by trimming and removing trailing semicolons
		value = value.trim();
		if(value.endsWith(";")) {
			value = value.substring(0, value.length - 1).trim();
		}
		
		// If it's already a number, return it
		var numericValue = parseFloat(value);
		if(!isNaN(numericValue) && value === String(numericValue)) {
			return numericValue;
		}
		
		// Handle simple units
		if(value.endsWith("%")) {
			return (parseFloat(value) / 100) * contextSize;
		}
		if(value.endsWith("px")) {
			return parseFloat(value);
		}
		
		// Handle calc() expressions
		if(value.startsWith("calc(") && value.endsWith(")")) {
			var expression = value.substring(5, value.length - 1).trim();
			return evaluateCalcExpression(expression, contextSize, handleSize);
		}
		
		// If we can't evaluate it, try to parse as a number
		return parseFloat(value) || 0;
	};
	
	// Helper to update the tiddler values based on drag delta (in pixels)
	var updateValues = function(pixelDelta, operation) {
		// For concurrent resize scenarios, re-evaluate min value if it contains calc()
		// This ensures we get current values from other panels
		if(self.minValueRaw && self.minValueRaw.indexOf("calc(") !== -1) {
			var freshMinValue = evaluateCSSValue(self.minValueRaw, operation.parentSizeAtStart, operation.handleSize);
			if(freshMinValue !== null) {
				operation.effectiveMinValue = Math.max(freshMinValue, 0);
			}
		}
		
		// For concurrent resize scenarios, re-evaluate max value if it contains calc()
		// This ensures we get current values from other panels
		if(self.maxValueRaw && self.maxValueRaw.indexOf("calc(") !== -1) {
			var freshMaxValue = evaluateCSSValue(self.maxValueRaw, operation.parentSizeAtStart, operation.handleSize);
			if(freshMaxValue !== null && freshMaxValue > 0) {
				operation.effectiveMaxValue = freshMaxValue;
			}
		}
		
		// Pre-calculate clamped delta based on min/max constraints
		var clampedDelta = pixelDelta;
		
		// Check constraints for all tiddlers and clamp delta accordingly
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(operation.startValues[tiddlerTitle] !== undefined) {
					var newPixelValue = operation.startValues[tiddlerTitle] + pixelDelta;
					// Ensure minimum value is respected (never less than absolute minimum)
					var absoluteMin = Math.max(operation.effectiveMinValue || 0, 0);
					if(newPixelValue < absoluteMin) {
						// Calculate the maximum negative delta that won't go below min
						var maxNegativeDelta = absoluteMin - operation.startValues[tiddlerTitle];
						clampedDelta = Math.max(clampedDelta, maxNegativeDelta);
					}
					if(operation.effectiveMaxValue !== null && operation.effectiveMaxValue > 0 && newPixelValue > operation.effectiveMaxValue) {
						// Calculate the maximum positive delta that won't exceed max
						var maxPositiveDelta = operation.effectiveMaxValue - operation.startValues[tiddlerTitle];
						clampedDelta = Math.min(clampedDelta, maxPositiveDelta);
					}
				}
			});
		} else if(self.targetTiddler) {
			var newPixelValue = operation.startValue + pixelDelta;
			var absoluteMin = Math.max(operation.effectiveMinValue || 0, 0);
			if(newPixelValue < absoluteMin) {
				clampedDelta = absoluteMin - operation.startValue;
			}
			if(operation.effectiveMaxValue !== null && operation.effectiveMaxValue > 0 && newPixelValue > operation.effectiveMaxValue) {
				clampedDelta = operation.effectiveMaxValue - operation.startValue;
			}
		}
		
		// Update all target tiddlers with clamped delta
		if(self.targetTiddlers && self.targetTiddlers.length > 0) {
			$tw.utils.each(self.targetTiddlers, function(tiddlerTitle) {
				if(operation.startValues[tiddlerTitle] !== undefined && operation.startUnits[tiddlerTitle]) {
					var newPixelValue = operation.startValues[tiddlerTitle] + clampedDelta;
					var originalUnit = operation.startUnits[tiddlerTitle];
					
					// Convert back to the original unit
					// Use the first target element for percentage calculations if available
					var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
					var convertedValue = convertFromPixels(newPixelValue, originalUnit, referenceElement);
					
					// Ensure the converted value never goes below the minimum
					if(operation.effectiveMinValue !== null) {
						var minInOriginalUnit = convertFromPixels(Math.max(operation.effectiveMinValue, 0), originalUnit, referenceElement);
						convertedValue = Math.max(convertedValue, minInOriginalUnit);
					}
					
					// Format the value based on the original unit type
					var formattedValue;
					if(originalUnit === "%") {
						// For percentages, round to 1 decimal place
						formattedValue = convertedValue.toFixed(1) + "%";
					} else if(originalUnit === "em" || originalUnit === "rem") {
						// For em/rem, round to 2 decimal places
						formattedValue = convertedValue.toFixed(2) + originalUnit;
					} else if(originalUnit === "px") {
						// For pixels, round to integer
						formattedValue = Math.round(convertedValue) + "px";
					} else {
						// For other units (vh, vw, etc.), round to 1 decimal place
						formattedValue = convertedValue.toFixed(1) + originalUnit;
					}
					
					self.wiki.setText(tiddlerTitle, self.targetField || "text", null, formattedValue);
				}
			});
		} else if(self.targetTiddler) {
			// Fallback to single tiddler for backwards compatibility
			var newPixelValue = operation.startValue + clampedDelta;
			
			// Use widget's unit for single tiddler mode
			// Use the first target element for percentage calculations if available
			var referenceElement = operation.targetElements && operation.targetElements[0] ? operation.targetElements[0] : domNode;
			var convertedValue = convertFromPixels(newPixelValue, self.unit, referenceElement);
			
			// Ensure the converted value never goes below the minimum
			if(operation.effectiveMinValue !== null) {
				var minInOriginalUnit = convertFromPixels(Math.max(operation.effectiveMinValue, 0), self.unit, referenceElement);
				convertedValue = Math.max(convertedValue, minInOriginalUnit);
			}
			
			// Format the value based on the unit type
			var formattedValue;
			if(self.unit === "%") {
				// For percentages, round to 1 decimal place
				formattedValue = convertedValue.toFixed(1) + "%";
			} else if(self.unit === "em" || self.unit === "rem") {
				// For em/rem, round to 2 decimal places
				formattedValue = convertedValue.toFixed(2) + self.unit;
			} else {
				// For pixels and other units, round to integer
				formattedValue = Math.round(convertedValue) + (self.unit || "px");
			}
			
			self.wiki.setText(self.targetTiddler, self.targetField || "text", null, formattedValue);
		}
		
		// Call action string if provided
		if(self.actions) {
			// Use the first tiddler's value for the action
			var actionPixelValue = operation.startValue + clampedDelta;
			if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
				actionPixelValue = operation.startValues[self.targetTiddlers[0]] + clampedDelta;
			}
			
			// Convert to widget's unit for the action
			var actionValue = convertFromPixels(actionPixelValue, self.unit, domNode);
			var formattedValue;
			if(self.unit === "%") {
				formattedValue = actionValue.toFixed(1) + "%";
			} else if(self.unit === "em" || self.unit === "rem") {
				formattedValue = actionValue.toFixed(2) + self.unit;
			} else {
				formattedValue = Math.round(actionValue) + (self.unit || "px");
			}
			// Set variables for the action string
			self.setVariable("actionValue", actionValue.toString());
			self.setVariable("actionFormattedValue", formattedValue);
			self.setVariable("actionHandleSize", operation.handleSize.toString());
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
			cursor: null
		};
	};
	
	var handlePointerDown = function(event) {
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
		
		// For now, use simple start position without offset adjustment
		operation.startX = event.clientX;
		operation.startY = event.clientY;
		
		// Calculate handle size early
		var handleSize = getHandleSize();
		operation.handleSize = handleSize;
		
		// We'll set up parent size cache after finding target elements
		
		// Find the target element(s) to resize FIRST so we can measure them
		operation.targetElements = []; // Initialize array when needed
		if(self.targetSelector) {
			if(self.resizeMode === "multiple") {
				operation.targetElements = Array.from(self.document.querySelectorAll(self.targetSelector));
			} else {
				var singleElement = self.document.querySelector(self.targetSelector);
				if(singleElement) operation.targetElements = [singleElement];
			}
		} else if(self.targetElement === "parent") {
			operation.targetElements = [domNode.parentElement];
		} else if(self.targetElement === "previousSibling") {
			if(domNode.previousElementSibling) operation.targetElements = [domNode.previousElementSibling];
		} else if(self.targetElement === "nextSibling") {
			if(domNode.nextElementSibling) operation.targetElements = [domNode.nextElementSibling];
		} else {
			// Default behavior depends on handle position
			if(self.handlePosition === "overlay") {
				// For overlay mode, target the parent element
				operation.targetElements = [domNode.parentElement];
			} else {
				// For non-overlay mode: for vertical resizers, target previous sibling; for horizontal, target previous sibling
				if(self.direction === "vertical") {
					if(domNode.previousElementSibling) operation.targetElements = [domNode.previousElementSibling];
				} else {
					if(domNode.previousElementSibling) operation.targetElements = [domNode.previousElementSibling];
				}
			}
		}
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
		
		// Cache the evaluated min/max values at drag start
		operation.effectiveMinValue = self.minValueRaw ? evaluateCSSValue(self.minValueRaw, operation.parentSizeAtStart, handleSize) : null;
		operation.effectiveMaxValue = self.maxValueRaw ? evaluateCSSValue(self.maxValueRaw, operation.parentSizeAtStart, handleSize) : null;
		
		// Ensure min/max values are reasonable
		if(operation.effectiveMinValue !== null) {
			operation.effectiveMinValue = Math.max(operation.effectiveMinValue, 0);
		}
		if(operation.effectiveMaxValue !== null && operation.effectiveMaxValue < 0) {
			// If max value calculated to negative (can happen with concurrent resize), 
			// use parent size as a reasonable maximum
			operation.effectiveMaxValue = operation.parentSizeAtStart * 0.8;
		}
		
		// Get and store the current value for each tiddler
		operation.startValues = {}; // Create object when needed
		operation.startUnits = {}; // Create object when needed
		
		// Helper to get the actual computed size of an element
		var getElementSize = function(element) {
			if(!element) return null;
			var rect = element.getBoundingClientRect();
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
					var tiddler = self.wiki.getTiddler(tiddlerTitle);
					var storedValue;
					if(tiddler && self.targetField && self.targetField !== "text") {
						storedValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
					} else {
						storedValue = self.wiki.getTiddlerText(tiddlerTitle, self.defaultValue || "200px");
					}
					// If the stored value is empty or just whitespace, use the default value
					if(!storedValue || storedValue.trim() === "") {
						storedValue = self.defaultValue || "200px";
					}
					operation.startUnits[tiddlerTitle] = getUnit(storedValue);
				} else {
					// For other tiddlers or if no element to measure, fall back to stored value
					var tiddler = self.wiki.getTiddler(tiddlerTitle);
					var currentValue;
					if(tiddler && self.targetField && self.targetField !== "text") {
						currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
					} else {
						currentValue = self.wiki.getTiddlerText(tiddlerTitle, self.defaultValue || "200px");
					}
					
					// If the current value is empty or just whitespace, use the default value
					if(!currentValue || currentValue.trim() === "") {
						currentValue = self.defaultValue || "200px";
					}
					
					// Check if it's a calc() expression
					if(currentValue.startsWith("calc(") && currentValue.endsWith(")")) {
						// For calc expressions, we can't easily determine the unit, so default to px
						operation.startUnits[tiddlerTitle] = "px";
						// Evaluate the calc expression
						var pixelValue = evaluateCSSValue(currentValue, operation.parentSizeAtStart, handleSize);
						operation.startValues[tiddlerTitle] = pixelValue;
					} else {
						// Get the numeric value and unit
						var numericValue = getNumericValue(currentValue);
						var valueUnit = getUnit(currentValue);
						
						// Store the original unit for this tiddler
						operation.startUnits[tiddlerTitle] = valueUnit;
						
						// Convert to pixels for internal calculations
						var pixelValue = convertToPixels(numericValue, valueUnit, domNode);
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
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var storedValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					storedValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					storedValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				// If the stored value is empty or just whitespace, use the default value
				if(!storedValue || storedValue.trim() === "") {
					storedValue = self.defaultValue || "200px";
				}
				// For calc expressions, default to px unit
				if(storedValue.startsWith("calc(") && storedValue.endsWith(")")) {
					self.unit = "px";
				} else {
					self.unit = getUnit(storedValue);
				}
			} else {
				// No element to measure, fall back to stored value
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				
				// If the current value is empty or just whitespace, use the default value
				if(!currentValue || currentValue.trim() === "") {
					currentValue = self.defaultValue || "200px";
				}
				
				// Check if it's a calc() expression
				if(currentValue.startsWith("calc(") && currentValue.endsWith(")")) {
					// For calc expressions, we can't easily determine the unit, so default to px
					self.unit = "px";
					// Evaluate the calc expression
					operation.startValue = evaluateCSSValue(currentValue, operation.parentSizeAtStart, handleSize);
				} else {
					// Get the numeric value and unit
					var numericValue = getNumericValue(currentValue);
					var valueUnit = getUnit(currentValue);
					self.unit = valueUnit;
					
					// Convert to pixels for internal calculations
					operation.startValue = convertToPixels(numericValue, valueUnit, domNode);
				}
			}
		} else {
			// No tiddler specified, try to measure element or use default
			if(measuredSize !== null) {
				operation.startValue = measuredSize;
			} else {
				// Evaluate the default value which might be a calc() expression
				operation.startValue = evaluateCSSValue(self.defaultValue || "200px", operation.parentSizeAtStart, handleSize);
			}
		}
		
		// Add active class
		domNode.classList.add("tc-resizer-active");
		
		// Add resizing class to body to disable transitions
		self.document.body.classList.add("tc-resizing");
		
		// Prevent touch scrolling during resize
		self.document.body.style.touchAction = "none";
		
		// Call resize start callback
		if(self.onResizeStart) {
			// Set variables for the action string
			self.setVariable("actionValue", operation.startValue.toString());
			self.setVariable("actionFormattedValue", operation.startValue + (self.unit || "px"));
			self.setVariable("actionDirection", self.direction);
			self.setVariable("actionProperty", self.targetProperty);
			self.setVariable("actionHandleSize", handleSize.toString());
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
				
				// Calculate pixel delta based on direction and invert setting
				var pixelDelta;
				if(self.direction === "horizontal") {
					pixelDelta = self.invertDirection === "yes" ? -deltaX : deltaX;
				} else {
					pixelDelta = self.invertDirection === "yes" ? -deltaY : deltaY;
				}
				
				// Update all values based on the pixel delta
				updateValues(pixelDelta, operation);
				
				// Call resize callback
				if(self.onResize) {
					// Use the first tiddler's value for the callback
					var callbackPixelValue = operation.startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						callbackPixelValue = operation.startValues[self.targetTiddlers[0]] + pixelDelta;
					}
					
					// Convert to widget's unit for the callback
					var callbackValue = convertFromPixels(callbackPixelValue, self.unit, domNode);
					var formattedValue;
					if(self.unit === "%") {
						formattedValue = callbackValue.toFixed(1) + "%";
					} else if(self.unit === "em" || self.unit === "rem") {
						formattedValue = callbackValue.toFixed(2) + self.unit;
					} else {
						formattedValue = Math.round(callbackValue) + (self.unit || "px");
					}
					
					// Set variables for the action string
					self.setVariable("actionValue", callbackValue.toString());
					self.setVariable("actionFormattedValue", formattedValue);
					self.setVariable("actionDirection", self.direction);
					self.setVariable("actionProperty", self.targetProperty);
					self.setVariable("actionDeltaX", deltaX.toString());
					self.setVariable("actionDeltaY", deltaY.toString());
					self.setVariable("actionHandleSize", operation.handleSize.toString());
					self.invokeActionString(self.onResize, self);
				}
				
				// Optionally update the target element(s) directly for immediate feedback
				if(self.liveResize === "yes" && operation.targetElements.length > 0) {
					// For live resize of DOM elements, we'll use the first tiddler's value as reference
					var livePixelValue = operation.startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						livePixelValue = operation.startValues[self.targetTiddlers[0]] + pixelDelta;
					}
					
					// Apply min/max constraints to the pixel value
					var absoluteMin = Math.max(operation.effectiveMinValue || 0, 0);
					if(livePixelValue < absoluteMin) {
						livePixelValue = absoluteMin;
					}
					if(operation.effectiveMaxValue !== null && operation.effectiveMaxValue > 0 && livePixelValue > operation.effectiveMaxValue) {
						livePixelValue = operation.effectiveMaxValue;
					}
					
					// Convert to widget's unit for live resize
					var liveValue = convertFromPixels(livePixelValue, self.unit, domNode);
					
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
		
		self.cleanupResize(event.pointerId);
		
		// Call resize end callback
		if(self.onResizeEnd) {
			// Get final value from tiddler or current state
			var finalValue = operation.startValue;
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
			} else if(self.targetTiddler) {
				var tiddler = self.wiki.getTiddler(self.targetTiddler);
				var currentValue;
				if(tiddler && self.targetField && self.targetField !== "text") {
					currentValue = tiddler.fields[self.targetField] || self.defaultValue || "200px";
				} else {
					currentValue = self.wiki.getTiddlerText(self.targetTiddler, self.defaultValue || "200px");
				}
				finalValue = getNumericValue(currentValue);
			}
			
			var formattedValue = self.unit === "%" ? finalValue.toFixed(1) + "%" : Math.round(finalValue) + (self.unit || "px");
			// Set variables for the action string
			self.setVariable("actionValue", finalValue.toString());
			self.setVariable("actionFormattedValue", formattedValue);
			self.setVariable("actionDirection", self.direction);
			self.setVariable("actionProperty", self.targetProperty);
			self.setVariable("actionHandleSize", operation.handleSize.toString());
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
	this.resizeMode = this.getAttribute("mode", "single"); // single or multiple
	this.handlePosition = this.getAttribute("handlePosition", "after"); // before, after, overlay
	this.onResizeStart = this.getAttribute("onResizeStart");
	this.onResize = this.getAttribute("onResize");
	this.onResizeEnd = this.getAttribute("onResizeEnd");
	this.disable = this.getAttribute("disable", "no");
	// Double-click reset attributes
	this.resetTo = this.getAttribute("resetTo", "default"); // default, min, max, custom
	this.resetValue = this.getAttribute("resetValue");
	this.smoothReset = this.getAttribute("smoothReset", "yes");
	this.onReset = this.getAttribute("onReset");
	// Handle style attribute
	this.handleStyle = this.getAttribute("handleStyle", "solid"); // solid, dots, lines, chevron, grip
	// Haptic feedback
	this.hapticFeedback = this.getAttribute("hapticFeedback", "yes");
	this.hapticDebug = this.getAttribute("hapticDebug", "no"); // Debug mode for haptic feedback
	// Make child widgets
	this.makeChildWidgets();
};

/*
Selectively refreshes the widget if needed. Returns true if the widget or any of its children needed re-rendering
*/
ResizerWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(Object.keys(changedAttributes).length) {
		// Check if only min/max values changed
		var onlyMinMaxChanged = true;
		var attributeNames = Object.keys(changedAttributes);
		for(var i = 0; i < attributeNames.length; i++) {
			if(attributeNames[i] !== "min" && attributeNames[i] !== "max") {
				onlyMinMaxChanged = false;
				break;
			}
		}
		
		if(onlyMinMaxChanged) {
			// Update only the min/max values without full refresh
			this.minValueRaw = this.getAttribute("min");
			this.maxValueRaw = this.getAttribute("max");
			// Parse min/max values - defaults depend on unit type
			var minDefault = this.unit === "%" ? "10" : "50";
			var maxDefault = this.unit === "%" ? "90" : "800";
			this.minValue = this.minValueRaw ? parseFloat(this.minValueRaw) : parseFloat(minDefault);
			this.maxValue = this.maxValueRaw ? parseFloat(this.maxValueRaw) : parseFloat(maxDefault);
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
	var self = this;
	
	// === COMPREHENSIVE CLEANUP (ES5-compatible) ===
	
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
		// Clear the operations object completely
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
			{ref: 'handleTouchStartReference', event: 'touchstart'}
		];
		
		for(var i = 0; i < listeners.length; i++) {
			if(self[listeners[i].ref]) {
				domNode.removeEventListener(listeners[i].event, self[listeners[i].ref]);
				self[listeners[i].ref] = null; // Clear reference
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
	self.triggerHaptic = null;
	self.cleanupResize = null;
	
	// 6. Clear caches and data structures
	self.parentSizeCache = {};
	self.parentSizeCacheOrder = [];
	
	// 7. Clear DOM references
	self.domNode = null;
	self.parentDomNode = null;
	
	// 8. Clear all attribute values to free memory
	self.actions = null;
	self.onResizeStart = null;
	self.onResize = null;
	self.onResizeEnd = null;
	self.onReset = null;
	
	// Call parent implementation
	Widget.prototype.removeChildDomNodes.call(this);
};

/*
Destroy the widget and clean up resources - For future TiddlyWiki versions
*/
ResizerWidget.prototype.destroy = function() {
	var self = this;
	
	// === COMPREHENSIVE CLEANUP (ES5-compatible) - Same as removeChildDomNodes ===
	
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
		// Null out the operations object completely
		self.activeResizeOperations = null;
	}
	
	// 2. Clear all timeouts immediately
	if(self.operationTimeouts) {
		for(var timeoutId in self.operationTimeouts) {
			if(self.operationTimeouts.hasOwnProperty(timeoutId)) {
				clearTimeout(self.operationTimeouts[timeoutId]);
			}
		}
		self.operationTimeouts = null;
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
			{ref: 'handleTouchStartReference', event: 'touchstart'}
		];
		
		for(var i = 0; i < listeners.length; i++) {
			if(self[listeners[i].ref]) {
				domNode.removeEventListener(listeners[i].event, self[listeners[i].ref]);
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
	self.triggerHaptic = null;
	self.cleanupResize = null;
	
	// 6. Clear caches and data structures
	self.parentSizeCache = null;
	self.parentSizeCacheOrder = null;
	
	// 7. Clear DOM references
	self.domNode = null;
	self.parentDomNode = null;
	self.domNodes = null;
	
	// 8. Clear all attribute values to free memory
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
	
	// Call parent destroy if it exists
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};

exports.resizer = ResizerWidget;
