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
Shared utility methods for all resizer instances
*/

// Get viewport dimensions with high precision
ResizerWidget.prototype.getViewportDimensions = function() {
	var win = this.document.defaultView || this.document.parentWindow || {};
	// Use visualViewport API for more precise measurements when available
	var viewport = win.visualViewport || null;
	var width, height;
	
	if(viewport) {
		// visualViewport provides sub-pixel precision and accounts for zoom/pinch
		width = viewport.width;
		height = viewport.height;
	} else {
		// Fallback to standard viewport measurements
		// innerWidth/Height are more accurate than clientWidth/Height as they include scrollbars
		width = win.innerWidth || this.document.documentElement.clientWidth;
		height = win.innerHeight || this.document.documentElement.clientHeight;
	}
	
	return {
		width: width,
		height: height,
		get vmin() { return Math.min(this.width, this.height); },
		get vmax() { return Math.max(this.width, this.height); }
	};
};

// Get computed font size for an element with sub-pixel precision
ResizerWidget.prototype.getComputedFontSize = function(element, isRoot) {
	try {
		var targetElement = isRoot ? this.document.documentElement : (element || this.domNodes[0]);
		if(targetElement) {
			var computedStyle = this.document.defaultView.getComputedStyle(targetElement);
			// Parse font-size with higher precision (don't round)
			var fontSize = computedStyle.fontSize;
			// Handle different units that might be returned
			if(fontSize.endsWith('px')) {
				return parseFloat(fontSize);
			} else if(fontSize.endsWith('pt')) {
				// Convert points to pixels (1pt = 1.333...px)
				return parseFloat(fontSize) * (96 / 72);
			} else {
				// For other units, try to parse as-is
				return parseFloat(fontSize) || 16;
			}
		}
	} catch(e) {
		// Use default if getComputedStyle fails
	}
	return 16;
};

// Convert any CSS unit to pixels with high precision
ResizerWidget.prototype.convertToPixels = function(value, unit, contextSize, element) {
	var numericValue = parseFloat(value);
	if(isNaN(numericValue)) return 0;
	
	// Cache viewport dimensions for this conversion to avoid multiple calls
	var viewport = null;
	if(unit === "vh" || unit === "vw" || unit === "vmin" || unit === "vmax") {
		viewport = this.getViewportDimensions();
	}
	
	switch(unit) {
		case "px":
			return numericValue;
		case "%":
			// Use precise multiplication without intermediate rounding
			return (numericValue * contextSize) / 100;
		case "em":
			// Get precise font size and multiply
			return numericValue * this.getComputedFontSize(element, false);
		case "rem":
			// Get precise root font size and multiply
			return numericValue * this.getComputedFontSize(element, true);
		case "vh":
			// Use cached viewport and precise division
			return (numericValue * viewport.height) / 100;
		case "vw":
			// Use cached viewport and precise division
			return (numericValue * viewport.width) / 100;
		case "vmin":
			// Use cached viewport and precise division
			return (numericValue * viewport.vmin) / 100;
		case "vmax":
			// Use cached viewport and precise division
			return (numericValue * viewport.vmax) / 100;
		default:
			return numericValue;
	}
};

// Convert pixels back to the original unit with high precision
ResizerWidget.prototype.convertFromPixels = function(pixelValue, unit, contextSize, element) {
	// Cache viewport dimensions for this conversion to avoid multiple calls
	var viewport = null;
	if(unit === "vh" || unit === "vw" || unit === "vmin" || unit === "vmax") {
		viewport = this.getViewportDimensions();
	}
	
	switch(unit) {
		case "px":
			return pixelValue;
		case "%":
			// Precise percentage calculation
			return contextSize > 0 ? Math.max((pixelValue * 100) / contextSize, 0) : 0;
		case "em":
			// Precise em calculation with sub-pixel font size
			var fontSize = this.getComputedFontSize(element, false);
			return fontSize > 0 ? pixelValue / fontSize : 0;
		case "rem":
			// Precise rem calculation with sub-pixel root font size
			var rootFontSize = this.getComputedFontSize(element, true);
			return rootFontSize > 0 ? pixelValue / rootFontSize : 0;
		case "vh":
			// Precise viewport height percentage
			return viewport.height > 0 ? (pixelValue * 100) / viewport.height : 0;
		case "vw":
			// Precise viewport width percentage
			return viewport.width > 0 ? (pixelValue * 100) / viewport.width : 0;
		case "vmin":
			// Precise viewport minimum percentage
			return viewport.vmin > 0 ? (pixelValue * 100) / viewport.vmin : 0;
		case "vmax":
			// Precise viewport maximum percentage
			return viewport.vmax > 0 ? (pixelValue * 100) / viewport.vmax : 0;
		default:
			return pixelValue;
	}
};

// Detect the unit of a value
ResizerWidget.prototype.getUnit = function(value) {
	if(typeof value !== "string") return "px";
	// Handle calc() expressions - default to px
	if(value.startsWith("calc(") && value.endsWith(")")) return "px";
	var units = ["px", "%", "em", "rem", "vh", "vw", "vmin", "vmax"];
	for(var i = 0; i < units.length; i++) {
		if(value.endsWith(units[i])) return units[i];
	}
	// If no unit specified, assume pixels
	return "px";
};

// Robust calc() expression evaluator with support for nested expressions, parentheses, and all operations
ResizerWidget.prototype.evaluateCalcExpression = function(expression, contextSize, handleSize, depth) {
	var self = this;
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
			var nestedDepth = 1;
			var j = i + 5;
			while(j < expression.length && nestedDepth > 0) {
				if(expression[j] === "(") nestedDepth++;
				else if(expression[j] === ")") nestedDepth--;
				j++;
			}
			// Recursively evaluate nested calc with depth tracking
			var nestedExpr = expression.substring(i + 5, j - 1);
			var nestedResult = self.evaluateCalcExpression(nestedExpr, contextSize, handleSize, depth + 1);
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
			values.push(convertToPixelsCalc(token, contextSize));
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
	
	function convertToPixelsCalc(value, contextSize) {
		// Handle special variables
		if(value === "handleSize" || value === "handleWidth" || value === "handleHeight") {
			return handleSize || 0;
		}
		
		// If already a number, return it
		var num = parseFloat(value);
		if(!isNaN(num) && value === String(num)) {
			return num;
		}
		
		// Cache viewport dimensions for efficiency
		var viewport = self.getViewportDimensions();
		
		// Extract numeric value with high precision
		var numericValue = parseFloat(value);
		if(isNaN(numericValue)) return 0;
		
		// Handle different units with improved precision
		if(value.endsWith("px")) {
			return numericValue;
		} else if(value.endsWith("vw")) {
			// Use precise multiplication
			return (numericValue * viewport.width) / 100;
		} else if(value.endsWith("vh")) {
			// Use precise multiplication
			return (numericValue * viewport.height) / 100;
		} else if(value.endsWith("vmin")) {
			// Use precise multiplication
			return (numericValue * viewport.vmin) / 100;
		} else if(value.endsWith("vmax")) {
			// Use precise multiplication
			return (numericValue * viewport.vmax) / 100;
		} else if(value.endsWith("%")) {
			// Use precise multiplication
			return (numericValue * contextSize) / 100;
		} else if(value.endsWith("rem")) {
			// Use precise rem calculation
			var rootFontSize = self.getComputedFontSize(self.domNodes[0], true);
			return numericValue * rootFontSize;
		} else if(value.endsWith("em")) {
			// Use precise em calculation
			var fontSize = self.getComputedFontSize(self.domNodes[0], false);
			return numericValue * fontSize;
		} else {
			// Try to parse as number (treat as pixels)
			return numericValue || 0;
		}
	}
};

// Format a numeric value with the appropriate unit and stable precision
ResizerWidget.prototype.formatValueWithUnit = function(value, unit) {
	unit = unit || this.unit || "px";

	var formatNumber = function(number, decimals) {
		if(!isFinite(number)) {
			number = 0;
		}
		return number
			.toFixed(decimals)
			.replace(/\.?0+$/, "");
	};

	switch(unit) {
		case "%":
			// Use enough precision for stable layouts, without floating-point noise
			return formatNumber(value, 6) + "%";
		case "em":
		case "rem":
			return formatNumber(value, 4) + unit;
		case "vh":
		case "vw":
		case "vmin":
		case "vmax":
			return formatNumber(value, 4) + unit;
		case "px":
		default:
			return formatNumber(value, 2) + "px";
	}
};

// Get target elements based on widget configuration
ResizerWidget.prototype.getTargetElements = function(domNode) {
	var targetElements = [];
	if(this.targetSelector) {
		if(this.resizeMode === "multiple") {
			targetElements = Array.from(this.document.querySelectorAll(this.targetSelector));
		} else {
			var singleElement = this.document.querySelector(this.targetSelector);
			if(singleElement) targetElements = [singleElement];
		}
	} else if(this.targetElement === "parent") {
		targetElements = [domNode.parentElement];
	} else if(this.targetElement === "parent.parent") {
		if(domNode.parentElement && domNode.parentElement.parentElement) {
			targetElements = [domNode.parentElement.parentElement];
		}
	} else if(this.targetElement === "previousSibling") {
		if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
	} else if(this.targetElement === "nextSibling") {
		if(domNode.nextElementSibling) targetElements = [domNode.nextElementSibling];
	} else {
		// Default behavior depends on handle position
		if(this.handlePosition === "overlay") {
			// For overlay mode, target the parent element
			targetElements = [domNode.parentElement];
		} else {
			// For non-overlay mode: default to previous sibling
			if(domNode.previousElementSibling) targetElements = [domNode.previousElementSibling];
		}
	}
	return targetElements;
};

// Read a value from a tiddler with proper field handling
ResizerWidget.prototype.getTiddlerValue = function(tiddlerTitle, defaultValue) {
	var tiddler = this.wiki.getTiddler(tiddlerTitle);
	var value;
	if(tiddler && this.targetField && this.targetField !== "text") {
		value = tiddler.fields[this.targetField] || defaultValue || this.defaultValue || "200px";
	} else {
		value = this.wiki.getTiddlerText(tiddlerTitle, defaultValue || this.defaultValue || "200px");
	}
	// If the value is empty or just whitespace, use the default value
	if(!value || value.trim() === "") {
		value = defaultValue || this.defaultValue || "200px";
	}
	return value;
};

// Apply min/max constraints to a value
ResizerWidget.prototype.applyConstraints = function(value, minValue, maxValue) {
	if(minValue !== null && minValue !== undefined && value < minValue) {
		return minValue;
	}
	if(maxValue !== null && maxValue !== undefined && value > maxValue) {
		return maxValue;
	}
	return value;
};

// Helper to evaluate calc() expressions and other CSS values
ResizerWidget.prototype.evaluateCSSValue = function(value, contextSize, handleSize) {
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
		return this.evaluateCalcExpression(expression, contextSize, handleSize);
	}
	
	// If we can't evaluate it, try to parse as a number
	return parseFloat(value) || 0;
};


/*
Render this widget into the DOM
*/
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
		if(!secondaryElement && primaryElement) {
			secondaryElement = primaryElement.nextElementSibling;
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
		
		// Update all target tiddlers with clamped delta
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
			resizeBoundaryAtStart: null
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
		
		// Set up coupled adjacent-column resizing after the generic start value
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
					var callbackPixelValue = operation.startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						callbackPixelValue = operation.startValues[self.targetTiddlers[0]] + pixelDelta;
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

					var deltaPixels = self.direction === "horizontal" ? pixelDelta : pixelDelta;
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
					if(operation.splitPair) {
						setSplitPairActionVariables(operation, pixelDelta, "resize");
					}
					self.invokeActionString(self.onResize, self);
				}
				
				// Optionally update the target element(s) directly for immediate feedback
				if(self.liveResize === "yes" && operation.targetElements.length > 0 && !(self.resizeMode === "split-pair" && operation.splitPair)) {
					// For live resize of DOM elements, we'll use the first tiddler's value as reference
					var livePixelValue = operation.startValue + pixelDelta;
					if(self.targetTiddlers && self.targetTiddlers.length > 0 && operation.startValues[self.targetTiddlers[0]] !== undefined) {
						livePixelValue = operation.startValues[self.targetTiddlers[0]] + pixelDelta;
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

exports.resizer = ResizerWidget;
