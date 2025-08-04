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
	if(this.disable === "yes") {
		domNode.setAttribute("data-disabled", "true");
	}
	// Ensure touch-action is set for touch devices
	// For vertical resizers, we need to be more specific to prevent scroll interference
	if(this.direction === "vertical") {
		domNode.style.touchAction = "none";
		domNode.style.msTouchAction = "none"; // For older IE/Edge
		domNode.style.webkitTouchAction = "none"; // For older webkit
	} else {
		domNode.style.touchAction = "none";
	}
	// Add event handlers only if not disabled
	if(this.disable !== "yes") {
		this.addEventHandlers(domNode);
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
Add event handlers to the resizer
*/
ResizerWidget.prototype.addEventHandlers = function(domNode) {
	var self = this;
	
	// Store domNode reference for cleanup
	self.domNode = domNode;
	
	// Store active resize operations by pointer ID (using object for ES5 compatibility)
	self.activeResizeOperations = {};
	// Store shared parent size cache for coordinated resizing
	self.parentSizeCache = {};
	var aspectRatioValue = null;
	
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
	var evaluateCalcExpression = function(expression, contextSize, handleSize) {
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
				// Recursively evaluate nested calc
				var nestedExpr = expression.substring(i + 5, j - 1);
				var nestedResult = evaluateCalcExpression(nestedExpr, contextSize);
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
	
	// Create a resize operation object for a specific pointer
	var createResizeOperation = function(pointerId) {
		return {
			pointerId: pointerId,
			isResizing: true,
			startX: 0,
			startY: 0,
			startValue: 0,
			startValues: {},
			startUnits: {},
			targetElement: null,
			targetElements: [],
			initialMouseX: 0,
			initialMouseY: 0,
			parentSizeAtStart: 0,
			parentKey: null,
			effectiveMinValue: null,
			effectiveMaxValue: null,
			animationFrameId: null,
			pendingMouseEvent: null,
			hasPointerCapture: false
		};
	};
	
	var handlePointerDown = function(event) {
		event.preventDefault();
		event.stopPropagation();
		
		// Create a new resize operation for this pointer
		var operation = createResizeOperation(event.pointerId);
		self.activeResizeOperations[event.pointerId] = operation;
		
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
		operation.targetElements = [];
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
				self.parentSizeCache[parentKey] = operation.parentSizeAtStart;
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
		operation.startValues = {}; // Reset the object
		operation.startUnits = {}; // Reset the units object
		
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
	
	var handlePointerMove = function(event) {
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
		var operation = self.activeResizeOperations[pointerId];
		if(!operation || !operation.isResizing) return;
		
		operation.isResizing = false;
		
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
	
	var handlePointerUp = function(event) {
		var operation = self.activeResizeOperations[event.pointerId];
		if(!operation || !operation.isResizing) return;
		
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
	self.handlePointerMoveReference = handlePointerMove;
	self.handlePointerUpReference = handlePointerUp;
	self.handleGotPointerCaptureReference = handleGotPointerCapture;
	
	// Add pointer event listeners
	// Only pointerdown on the element itself
	domNode.addEventListener("pointerdown", handlePointerDown);
	
	// Move and up events on document for multi-touch support
	// These are only added once per widget instance
	if(!self.documentListenersAdded) {
		self.document.addEventListener("pointermove", handlePointerMove);
		self.document.addEventListener("pointerup", handlePointerUp);
		self.document.addEventListener("pointercancel", handlePointerUp);
		self.documentListenersAdded = true;
	}
	
	// Handle pointer capture events
	domNode.addEventListener("lostpointercapture", handlePointerUp);
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
	// Clean up any active resize operation
	if(this.cleanupResize) {
		this.cleanupResize();
	}
	// Call parent implementation
	Widget.prototype.removeChildDomNodes.call(this);
};

/*
Destroy the widget and clean up resources
*/
ResizerWidget.prototype.destroy = function() {
	var self = this;
	// Remove event listeners
	if(self.domNodes && self.domNodes[0]) {
		var domNode = self.domNodes[0];
		if(self.handlePointerDownReference) {
			domNode.removeEventListener("pointerdown", self.handlePointerDownReference);
		}
		if(self.handlePointerUpReference) {
			domNode.removeEventListener("lostpointercapture", self.handlePointerUpReference);
		}
		if(self.handleGotPointerCaptureReference) {
			domNode.removeEventListener("gotpointercapture", self.handleGotPointerCaptureReference);
		}
	}
	// Remove document-level listeners
	if(self.documentListenersAdded && self.handlePointerMoveReference && self.handlePointerUpReference) {
		self.document.removeEventListener("pointermove", self.handlePointerMoveReference);
		self.document.removeEventListener("pointerup", self.handlePointerUpReference);
		self.document.removeEventListener("pointercancel", self.handlePointerUpReference);
		self.documentListenersAdded = false;
	}
	// Clean up any active resize operations
	if(self.activeResizeOperations && self.cleanupResize) {
		for(var pointerId in self.activeResizeOperations) {
			if(self.activeResizeOperations[pointerId].isResizing) {
				// Call cleanupResize directly
				self.cleanupResize(pointerId);
			}
		}
	}
	// Call parent destroy if it exists
	if(Widget.prototype.destroy) {
		Widget.prototype.destroy.call(this);
	}
};

exports.resizer = ResizerWidget;
